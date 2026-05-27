import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';
import { requireRole } from '../middleware/role.js';
import { sseBroadcaster } from '../../services/sse-broadcaster.js';
import { triggerWorkflow } from '../../lib/n8n.js';

type HookResult<T> =
  | { success: true; data: T; target: string }
  | { success: false; error: { issues: Array<{ message: string }> }; data: T; target: string };

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

// ── Helpers ───────────────────────────────────────────────────────────────────

type HolidayEntry = { date: string; [key: string]: unknown };

function calcWorkingDays(
  startDate: string,
  endDate: string,
  workDays: number[],
  holidays: HolidayEntry[]
): number {
  const holidaySet = new Set(holidays.map((h) => h.date));
  let count = 0;
  const current = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');

  while (current <= end) {
    const dow = current.getUTCDay(); // 0=Sun..6=Sat
    const dateStr = current.toISOString().split('T')[0] ?? '';
    if (workDays.includes(dow) && !holidaySet.has(dateStr)) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

// ── Employee routes (/api/me/vacaciones) ──────────────────────────────────────

const vacaciones = new Hono<{ Variables: AppVariables }>();

// ── GET /api/me/vacaciones/balance ────────────────────────────────────────────
vacaciones.get('/balance', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();
  const year = Number(c.req.query('year') ?? new Date().getFullYear());

  if (!user.company_id) {
    return c.json({ data: { total: 22, used: 0, remaining: 22 } });
  }

  // Get vacation_days_per_year from company_settings
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('vacation_days_per_year')
    .eq('company_id', user.company_id)
    .maybeSingle();

  const total = (settings as { vacation_days_per_year?: number } | null)?.vacation_days_per_year ?? 22;

  // Count approved vacation days for this year
  const { data: approved } = await supabaseAdmin
    .from('vacation_requests')
    .select('working_days')
    .eq('user_id', user.id)
    .eq('type', 'vacaciones')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`);

  const used = (approved ?? []).reduce((sum, r) => sum + ((r as { working_days: number }).working_days ?? 0), 0);

  return c.json({ data: { total, used, remaining: Math.max(0, total - used) } });
});

// ── GET /api/me/vacaciones ────────────────────────────────────────────────────
vacaciones.get('/', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const statusFilter = c.req.query('status');
  const yearFilter = c.req.query('year');
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '50')));
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('vacation_requests')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }
  if (yearFilter) {
    query = query.gte('start_date', `${yearFilter}-01-01`).lte('start_date', `${yearFilter}-12-31`);
  }

  const { data, error, count } = await query;

  if (error) {
    return c.json({ error: { code: 'internal_error', message: 'Error al obtener vacaciones' } }, 500);
  }

  const total = count ?? 0;
  return c.json({ data: { items: data ?? [], total, page, has_more: offset + limit < total } });
});

// ── POST /api/me/vacaciones ───────────────────────────────────────────────────
const createVacacionSchema = z.object({
  type: z.enum(['vacaciones', 'permiso_retribuido', 'asuntos_propios']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  reason: z.string().min(5, 'Mínimo 5 caracteres').max(500, 'Máximo 500 caracteres').optional(),
});

vacaciones.post(
  '/',
  zValidator('json', createVacacionSchema, zodErrorHook),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const supabaseAdmin = getSupabaseAdmin();

    if (!user.company_id) {
      return c.json({ error: { code: 'bad_request', message: 'Usuario sin empresa asignada' } }, 400);
    }

    if (body.start_date > body.end_date) {
      return c.json({ error: { code: 'validation_error', message: 'La fecha de fin debe ser igual o posterior a la de inicio' } }, 400);
    }

    // Load company settings for working days + holidays
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('work_schedule_days, holidays, vacation_days_per_year')
      .eq('company_id', user.company_id)
      .maybeSingle();

    const workDays: number[] = (settings as { work_schedule_days?: number[] } | null)?.work_schedule_days ?? [1, 2, 3, 4, 5];
    const holidays: HolidayEntry[] = ((settings as { holidays?: HolidayEntry[] } | null)?.holidays ?? []) as HolidayEntry[];
    const vacationDaysTotal = (settings as { vacation_days_per_year?: number } | null)?.vacation_days_per_year ?? 22;

    const workingDays = calcWorkingDays(body.start_date, body.end_date, workDays, holidays);

    if (workingDays < 1) {
      return c.json({ error: { code: 'validation_error', message: 'El rango seleccionado no contiene días laborables' } }, 422);
    }

    // Check overlap with existing pending/approved requests
    const { data: overlapping } = await supabaseAdmin
      .from('vacation_requests')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
      .lte('start_date', body.end_date)
      .gte('end_date', body.start_date)
      .limit(1);

    if ((overlapping ?? []).length > 0) {
      return c.json({ error: { code: 'conflict', message: 'Ya tienes una solicitud en ese período' } }, 409);
    }

    // For 'vacaciones', check remaining balance
    if (body.type === 'vacaciones') {
      const year = body.start_date.split('-')[0];
      const { data: approved } = await supabaseAdmin
        .from('vacation_requests')
        .select('working_days')
        .eq('user_id', user.id)
        .eq('type', 'vacaciones')
        .eq('status', 'approved')
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`);

      const used = (approved ?? []).reduce((sum, r) => sum + ((r as { working_days: number }).working_days ?? 0), 0);

      if (used + workingDays > vacationDaysTotal) {
        return c.json({
          error: {
            code: 'insufficient_balance',
            message: `No tienes suficientes días de vacaciones (disponibles: ${vacationDaysTotal - used}, solicitados: ${workingDays})`,
          },
        }, 422);
      }
    }

    const { data: vacacion, error } = await supabaseAdmin
      .from('vacation_requests')
      .insert({
        user_id: user.id,
        company_id: user.company_id,
        type: body.type,
        start_date: body.start_date,
        end_date: body.end_date,
        working_days: workingDays,
        reason: body.reason ?? null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !vacacion) {
      return c.json({ error: { code: 'internal_error', message: 'Error al crear la solicitud' } }, 500);
    }

    // Fire-and-forget notifications
    void (async () => {
      let manager_email: string | null = null;
      const { data: mgr } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('company_id', user.company_id!)
        .in('role', ['admin', 'manager'])
        .neq('id', user.id)
        .limit(1)
        .single();
      manager_email = mgr?.email ?? null;

      void triggerWorkflow('vacacion-nueva', {
        vacacion_id: (vacacion as { id: string }).id,
        user_email: user.email,
        manager_email,
        type: body.type,
        start_date: body.start_date,
        end_date: body.end_date,
        working_days: workingDays,
        reason: body.reason ?? null,
      });
    })();

    sseBroadcaster.emitToCompany(user.company_id, {
      type: 'vacacion_event',
      action: 'created',
      vacacion_id: (vacacion as { id: string }).id,
    });

    return c.json({ data: vacacion }, 201);
  }
);

export default vacaciones;

// ── Admin/Manager routes (/api/vacaciones) ────────────────────────────────────

export const adminVacaciones = new Hono<{ Variables: AppVariables }>();

// ── GET /api/vacaciones ───────────────────────────────────────────────────────
adminVacaciones.get(
  '/',
  requireRole(['admin', 'manager']),
  async (c) => {
    const user = c.get('user');
    const supabaseAdmin = getSupabaseAdmin();

    const statusFilter = c.req.query('status');
    const userIdFilter = c.req.query('user_id');
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const yearFilter = c.req.query('year');
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const offset = (page - 1) * limit;

    if (!user.company_id) {
      return c.json({ data: { items: [], total: 0, page, has_more: false } });
    }

    let query = supabaseAdmin
      .from('vacation_requests')
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
      query = query.gte('start_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('end_date', dateTo);
    }
    if (yearFilter) {
      query = query.gte('start_date', `${yearFilter}-01-01`).lte('start_date', `${yearFilter}-12-31`);
    }

    const { data, error, count } = await query;

    if (error) {
      return c.json({ error: { code: 'internal_error', message: 'Error al obtener solicitudes' } }, 500);
    }

    const total = count ?? 0;
    return c.json({ data: { items: data ?? [], total, page, has_more: offset + limit < total } });
  }
);

// ── PATCH /api/vacaciones/:id ─────────────────────────────────────────────────
const resolveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  manager_note: z.string().max(500).optional(),
});

adminVacaciones.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  zValidator('json', resolveSchema, zodErrorHook),
  async (c) => {
    const manager = c.get('user');
    const { id } = c.req.param();
    const { status, manager_note } = c.req.valid('json');
    const supabaseAdmin = getSupabaseAdmin();

    const { data: vac, error: fetchError } = await supabaseAdmin
      .from('vacation_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !vac) {
      return c.json({ error: { code: 'not_found', message: 'Solicitud no encontrada' } }, 404);
    }

    if ((vac as { company_id: string }).company_id !== manager.company_id) {
      return c.json({ error: { code: 'forbidden', message: 'Solicitud de otra empresa' } }, 403);
    }

    if ((vac as { status: string }).status !== 'pending') {
      return c.json({ error: { code: 'conflict', message: 'La solicitud ya fue resuelta' } }, 409);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('vacation_requests')
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
      return c.json({ error: { code: 'internal_error', message: 'Error al actualizar solicitud' } }, 500);
    }

    // Notify employee
    sseBroadcaster.emit((vac as { user_id: string }).user_id, {
      type: 'vacacion_resuelta',
      vacacion_id: id,
      status,
    });

    // Notify all admin connections
    if (manager.company_id) {
      sseBroadcaster.emitToCompany(manager.company_id, {
        type: 'vacacion_event',
        action: 'resolved',
        vacacion_id: id,
        status,
      });
    }

    // Fire-and-forget email to employee
    void (async () => {
      const { data: empProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, full_name')
        .eq('id', (vac as { user_id: string }).user_id)
        .single();

      void triggerWorkflow('vacacion-resuelta', {
        vacacion_id: id,
        user_id: (vac as { user_id: string }).user_id,
        user_email: empProfile?.email ?? null,
        user_name: empProfile?.full_name ?? empProfile?.email ?? 'Empleado',
        status,
        type: (vac as { type: string }).type,
        start_date: (vac as { start_date: string }).start_date,
        end_date: (vac as { end_date: string }).end_date,
        working_days: (vac as { working_days: number }).working_days,
        manager_note: manager_note ?? null,
      });
    })();

    return c.json({ data: updated });
  }
);
