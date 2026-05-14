import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';
import { requireRole } from '../middleware/role.js';
import { inferDetailType } from '../../lib/date-utils.js';
import { sseBroadcaster } from '../../services/sse-broadcaster.js';
import { triggerWorkflow } from '../../lib/n8n.js';

type HookResult<T> =
  | { success: true; data: T; target: string }
  | { success: false; error: z.ZodError; data: T; target: string };

function zodErrorHook<T>(result: HookResult<T>, c: Context): Response | void {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: result.error.issues.map((i) => i.message).join('; '),
          details: result.error.issues,
        },
      },
      400
    );
  }
}

// ── Employee routes (/api/me/incidencias) ─────────────────────────────────────

const incidencias = new Hono<{ Variables: AppVariables }>();

// ── GET /api/me/incidencias ───────────────────────────────────────────────────
incidencias.get('/', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const statusFilter = c.req.query('status'); // 'pending' | 'approved' | 'rejected'
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('incidencias')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al obtener incidencias' } },
      500
    );
  }

  const total = count ?? 0;
  return c.json({
    data: {
      items: data ?? [],
      total,
      page,
      has_more: offset + limit < total,
    },
  });
});

// ── POST /api/me/incidencias ──────────────────────────────────────────────────
const createIncidenciaSchema = z
  .object({
    type: z.enum(['olvido', 'correccion', 'ausencia', 'hora_extra']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    original_timestamp: z.string().datetime().optional(),
    requested_timestamp: z.string().datetime().optional(),
    requested_direction: z.enum(['in', 'out']).optional(),
    reason: z.string().min(10, 'Mínimo 10 caracteres').max(500, 'Máximo 500 caracteres'),
    access_log_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'olvido') {
      if (!data.requested_direction) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requested_direction'],
          message: 'requested_direction es obligatorio para tipo olvido',
        });
      }
      if (!data.requested_timestamp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requested_timestamp'],
          message: 'requested_timestamp es obligatorio para tipo olvido',
        });
      }
    }
    if (data.type === 'correccion') {
      if (!data.access_log_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['access_log_id'],
          message: 'access_log_id es obligatorio para tipo correccion',
        });
      }
      if (!data.requested_timestamp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requested_timestamp'],
          message: 'requested_timestamp es obligatorio para tipo correccion',
        });
      }
    }
  });

incidencias.post(
  '/',
  zValidator('json', createIncidenciaSchema, zodErrorHook),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const supabaseAdmin = getSupabaseAdmin();

    if (!user.company_id) {
      return c.json(
        { error: { code: 'bad_request', message: 'Usuario sin empresa asignada' } },
        400
      );
    }

    const { data: incidencia, error } = await supabaseAdmin
      .from('incidencias')
      .insert({
        user_id: user.id,
        company_id: user.company_id,
        type: body.type,
        date: body.date,
        original_timestamp: body.original_timestamp ?? null,
        requested_timestamp: body.requested_timestamp ?? null,
        requested_direction: body.requested_direction ?? null,
        reason: body.reason,
        access_log_id: body.access_log_id ?? null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !incidencia) {
      return c.json(
        { error: { code: 'internal_error', message: 'Error al crear incidencia' } },
        500
      );
    }

    // Fire-and-forget: notify manager via n8n
    void triggerWorkflow('incidencia-nueva', {
      incidencia_id: incidencia.id as string,
      user_name: user.email,
      type: body.type,
      date: body.date,
      reason: body.reason,
    });

    return c.json({ data: incidencia }, 201);
  }
);

// ── GET /api/me/incidencias/:id ───────────────────────────────────────────────
incidencias.get('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('incidencias')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return c.json(
      { error: { code: 'not_found', message: 'Incidencia no encontrada' } },
      404
    );
  }

  return c.json({ data });
});

export default incidencias;

// ── Admin/Manager routes (/api/incidencias) ───────────────────────────────────

export const adminIncidencias = new Hono<{ Variables: AppVariables }>();

// ── GET /api/incidencias ──────────────────────────────────────────────────────
adminIncidencias.get(
  '/',
  requireRole(['admin', 'manager']),
  async (c) => {
    const user = c.get('user');
    const supabaseAdmin = getSupabaseAdmin();

    const statusFilter = c.req.query('status');
    const userIdFilter = c.req.query('user_id');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const offset = (page - 1) * limit;

    if (!user.company_id) {
      return c.json({ data: { items: [], total: 0, page, has_more: false } });
    }

    let query = supabaseAdmin
      .from('incidencias')
      .select('*, profiles!user_id(full_name, email, employee_code)', { count: 'exact' })
      .eq('company_id', user.company_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      query = query.eq('status', statusFilter);
    }
    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }
    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    const { data, error, count } = await query;

    if (error) {
      return c.json(
        { error: { code: 'internal_error', message: 'Error al obtener incidencias' } },
        500
      );
    }

    const total = count ?? 0;
    return c.json({
      data: {
        items: data ?? [],
        total,
        page,
        has_more: offset + limit < total,
      },
    });
  }
);

// ── PATCH /api/incidencias/:id ────────────────────────────────────────────────
const resolveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  manager_note: z.string().max(500).optional(),
});

adminIncidencias.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  zValidator('json', resolveSchema, zodErrorHook),
  async (c) => {
    const manager = c.get('user');
    const { id } = c.req.param();
    const { status, manager_note } = c.req.valid('json');
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch incidencia — must belong to same company
    const { data: inc, error: fetchError } = await supabaseAdmin
      .from('incidencias')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !inc) {
      return c.json(
        { error: { code: 'not_found', message: 'Incidencia no encontrada' } },
        404
      );
    }

    if (inc.company_id !== manager.company_id) {
      return c.json(
        { error: { code: 'forbidden', message: 'Incidencia de otra empresa' } },
        403
      );
    }

    if (inc.status !== 'pending') {
      return c.json(
        { error: { code: 'conflict', message: 'La incidencia ya fue resuelta' } },
        409
      );
    }

    // ── Apply side-effects when approving ────────────────────────────────────
    if (status === 'approved') {
      if (inc.type === 'olvido') {
        // INSERT a new access_log with source='correction'
        const ts = inc.requested_timestamp as string;
        const { error: insertError } = await supabaseAdmin
          .from('access_logs')
          .insert({
            user_id: inc.user_id,
            event_type: 'granted',
            direction: inc.requested_direction,
            detail_type: inferDetailType(ts),
            timestamp: ts,
            source: 'correction',
            corrected: false,
            device_info: 'correction',
          });

        if (insertError) {
          return c.json(
            { error: { code: 'internal_error', message: 'Error al crear fichaje de corrección' } },
            500
          );
        }
      } else if (inc.type === 'correccion') {
        // Fetch the original log to preserve its current timestamp
        const { data: originalLog, error: logFetchError } = await supabaseAdmin
          .from('access_logs')
          .select('timestamp, source')
          .eq('id', inc.access_log_id)
          .single();

        if (logFetchError || !originalLog) {
          return c.json(
            { error: { code: 'not_found', message: 'Fichaje original no encontrado' } },
            404
          );
        }

        const { error: updateLogError } = await supabaseAdmin
          .from('access_logs')
          .update({
            corrected: true,
            original_timestamp: originalLog.timestamp,
            timestamp: inc.requested_timestamp,
            // source NOT changed — keep the original (signalr/web/mobile)
          })
          .eq('id', inc.access_log_id);

        if (updateLogError) {
          return c.json(
            { error: { code: 'internal_error', message: 'Error al corregir fichaje' } },
            500
          );
        }
      }
      // type='ausencia' | 'hora_extra' → no access_logs changes
    }

    // ── Update the incidencia ─────────────────────────────────────────────────
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('incidencias')
      .update({
        status,
        manager_note: manager_note ?? null,
        reviewed_by: manager.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return c.json(
        { error: { code: 'internal_error', message: 'Error al actualizar incidencia' } },
        500
      );
    }

    // Notify the employee in real time
    sseBroadcaster.emit(inc.user_id as string, {
      type: 'incidencia_resuelta',
      incidencia_id: id,
      status,
    });

    // Fire-and-forget: email to employee via n8n
    void triggerWorkflow('incidencia-resuelta', {
      incidencia_id: id,
      user_id: inc.user_id,
      status,
      manager_note: manager_note ?? null,
    });

    return c.json({ data: updated });
  }
);
