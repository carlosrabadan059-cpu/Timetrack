import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth.js';
import { humanizeSource } from '../../lib/date-utils.js';
import type { AppVariables } from '../../types/api.types.js';

const external = new Hono<{ Variables: AppVariables }>();

// Aplicar middleware de autenticación por API Key a todas las rutas externas
external.use('*', apiKeyAuthMiddleware);

const fichajesQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  employee_code: z.string().optional(),
  company_name: z.string().optional(),
  start_date: z.string().datetime({ precision: 3 }).optional(),
  end_date: z.string().datetime({ precision: 3 }).optional(),
  source: z.enum(['web', 'mobile', 'signalr', 'correction']).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('50'),
});

external.get('/fichajes', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) {
    return c.json({ error: { code: 'forbidden', message: 'Contexto de empresa no configurado en la llave' } }, 403);
  }

  const query = c.req.query();
  const parsed = fichajesQuerySchema.safeParse(query);

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'invalid_params',
          message: 'Parámetros de consulta incorrectos',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const { user_id, employee_code, start_date, end_date, source, page, limit, company_name } = parsed.data;
  const offset = (page - 1) * limit;

  const sb = getSupabaseAdmin();

  // 0. Si viene company_name en la query, validar estrictamente que coincida con la de la API Key (seguridad multi-tenant explícita)
  if (company_name) {
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();

    if (compErr || !company) {
      return c.json({ error: { code: 'forbidden', message: 'No se pudo verificar la empresa asociada a la API Key' } }, 403);
    }

    if (company.name.toLowerCase().trim() !== company_name.toLowerCase().trim()) {
      return c.json(
        {
          error: {
            code: 'tenant_mismatch',
            message: `Acceso denegado. La API Key provista no pertenece a la empresa "${company_name}".`,
          },
        },
        403
      );
    }
  }

  // 1. Si se suministra un employee_code, resolverlo primero para obtener el targetUserId
  let targetUserId = user_id;
  if (employee_code) {
    const { data: profile } = await sb
      .from('profiles')
      .select('id')
      .eq('employee_code', employee_code)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!profile) {
      return c.json({
        data: [],
        meta: {
          page,
          total: 0,
          has_more: false,
        },
      });
    }
    targetUserId = profile.id;
  }

  // 2. Construir la consulta a access_logs uniendo perfiles
  let q = sb
    .from('access_logs')
    .select('*, profiles!inner(id, full_name, email, employee_code)', { count: 'exact' })
    .eq('profiles.company_id', companyId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (targetUserId) {
    q = q.eq('user_id', targetUserId);
  }
  if (start_date) {
    q = q.gte('timestamp', start_date);
  }
  if (end_date) {
    q = q.lte('timestamp', end_date);
  }
  if (source) {
    q = q.eq('source', source);
  }

  const { data: logs, count, error } = await q;

  if (error) {
    console.error('[external] Error fetching access logs:', error);
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'Error al consultar fichajes en la base de datos',
        },
      },
      500
    );
  }

  // 3. Dar formato de respuesta estandarizado
  const items = (logs ?? []).map((log: any) => ({
    id: log.id,
    user: {
      id: log.profiles.id,
      full_name: log.profiles.full_name,
      email: log.profiles.email,
      employee_code: log.profiles.employee_code,
    },
    direction: log.direction,
    detail_type: log.detail_type,
    timestamp: log.timestamp,
    source: log.source,
    source_human: humanizeSource(log.source),
    device_info: log.device_info,
    latitude: log.latitude ? Number(log.latitude) : null,
    longitude: log.longitude ? Number(log.longitude) : null,
    corrected: log.corrected,
  }));

  return c.json({
    data: items,
    meta: {
      page,
      total: count ?? 0,
      has_more: offset + limit < (count ?? 0),
    },
  });
});

export default external;
