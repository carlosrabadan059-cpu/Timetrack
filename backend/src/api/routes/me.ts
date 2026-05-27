import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';
import { inferDetailType, checkOutOfSchedule, startOfDayISO, toDateString, getWeekStart } from '../../lib/date-utils.js';
import { sseBroadcaster } from '../../services/sse-broadcaster.js';
import { fichajeRateLimit, recordFichaje } from '../middleware/rate-limit.js';
import {
  calculateDaySummary,
  buildWeekBars,
  buildTodayDistribution,
  getJornadaStatus,
} from '../../services/attendance.js';

// @hono/zod-validator passes `data: T` on both success and failure (unlike z.SafeParseReturnType
// which has `data: never` on failure). This type matches the actual hook argument.
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

const me = new Hono<{ Variables: AppVariables }>();

// ── GET /api/me ───────────────────────────────────────────────────────────────
me.get('/', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return c.json(
      { error: { code: 'not_found', message: 'Perfil no encontrado' } },
      404
    );
  }

  return c.json({
    data: {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      employee_code: profile.employee_code,
      role: profile.role,
      company_id: profile.company_id ?? null,
      ac_external_id: profile.ac_external_id ?? null,
      ac_synced: !!profile.ac_synced_at,
      notifications_email: profile.notifications_email,
      two_factor_enabled: profile.two_factor_enabled,
      avatar_url: profile.avatar_url ?? null,
      access_valid_from: profile.access_valid_from ?? null,
      access_valid_to: profile.access_valid_to ?? null,
      created_at: profile.created_at,
    },
  });
});

// ── PATCH /api/me ─────────────────────────────────────────────────────────────
const patchMeSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  notifications_email: z.boolean().optional(),
  avatar_url: z.string().url().nullable().optional(),
});

me.patch('/', zValidator('json', patchMeSchema, zodErrorHook), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const supabaseAdmin = getSupabaseAdmin();

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates['full_name'] = body.full_name;
  if (body.notifications_email !== undefined) updates['notifications_email'] = body.notifications_email;
  if (body.avatar_url !== undefined) updates['avatar_url'] = body.avatar_url;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { code: 'bad_request', message: 'Sin campos a actualizar' } }, 400);
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('*')
    .single();

  if (error || !profile) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al actualizar perfil' } },
      500
    );
  }

  return c.json({
    data: {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      employee_code: profile.employee_code,
      role: profile.role,
      company_id: profile.company_id ?? null,
      ac_external_id: profile.ac_external_id ?? null,
      ac_synced: !!profile.ac_synced_at,
      notifications_email: profile.notifications_email,
      two_factor_enabled: profile.two_factor_enabled,
      avatar_url: profile.avatar_url ?? null,
      access_valid_from: profile.access_valid_from ?? null,
      access_valid_to: profile.access_valid_to ?? null,
      created_at: profile.created_at,
    },
  });
});

// ── POST /api/me/change-password ──────────────────────────────────────────────
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Mínimo 8 caracteres'),
});

me.post('/change-password', zValidator('json', changePasswordSchema, zodErrorHook), async (c) => {
  const user = c.get('user');
  const { current_password, new_password } = c.req.valid('json');
  const supabaseAdmin = getSupabaseAdmin();

  // Verify current password by attempting sign-in
  const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  });

  if (signInError) {
    return c.json(
      { error: { code: 'wrong_password', message: 'Contraseña actual incorrecta' } },
      400
    );
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: new_password,
  });

  if (updateError) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al cambiar la contraseña' } },
      500
    );
  }

  return c.json({ data: { success: true } });
});

// ── POST /api/me/notifications ────────────────────────────────────────────────
const notificationsSchema = z.object({
  enabled: z.boolean(),
});

me.post('/notifications', zValidator('json', notificationsSchema, zodErrorHook), async (c) => {
  const user = c.get('user');
  const { enabled } = c.req.valid('json');
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ notifications_email: enabled })
    .eq('id', user.id)
    .select('notifications_email')
    .single();

  if (error || !data) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al actualizar notificaciones' } },
      500
    );
  }

  return c.json({ data: { notifications_email: data.notifications_email } });
});

// ── POST /api/me/2fa/toggle ───────────────────────────────────────────────────
const twoFaSchema = z.object({
  enabled: z.boolean(),
});

me.post('/2fa/toggle', zValidator('json', twoFaSchema, zodErrorHook), async (c) => {
  const user = c.get('user');
  const { enabled } = c.req.valid('json');
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ two_factor_enabled: enabled })
    .eq('id', user.id)
    .select('two_factor_enabled')
    .single();

  if (error || !data) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al actualizar 2FA' } },
      500
    );
  }

  return c.json({ data: { two_factor_enabled: data.two_factor_enabled } });
});

// ── GET /api/me/sync-status ───────────────────────────────────────────────────
me.get('/sync-status', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('ac_external_id, ac_synced_at')
    .eq('id', user.id)
    .single();

  // sync_queue may not exist yet (Fase 5) — handle gracefully
  let pendingActions = 0;
  try {
    const { count } = await supabaseAdmin
      .from('sync_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing'])
      .eq('payload->>supabase_user_id', user.id);

    pendingActions = count ?? 0;
  } catch {
    // Table doesn't exist yet — safe to ignore
  }

  return c.json({
    data: {
      ac_synced: !!profile?.ac_synced_at,
      ac_external_id: profile?.ac_external_id ?? null,
      ac_synced_at: profile?.ac_synced_at ?? null,
      pending_actions: pendingActions,
    },
  });
});

// ── POST /api/me/fichar ───────────────────────────────────────────────────────
const ficharSchema = z.object({
  direction: z.enum(['in', 'out']).optional(),
  detail_type: z.enum(['normal', 'comida', 'descanso', 'medico', 'otro']).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  device_info: z.enum(['web', 'ios', 'android']).default('web'),
});

me.post('/fichar', fichajeRateLimit, async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();

  // Parse optional body — endpoint works with no body at all
  let rawBody: unknown = {};
  try {
    rawBody = await c.req.json();
  } catch {
    rawBody = {};
  }

  const parsed = ficharSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          details: parsed.error.issues,
        },
      },
      400
    );
  }
  const body = parsed.data;

  // Enforce clocking mode for this company
  if (user.company_id) {
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('clocking_modes')
      .eq('company_id', user.company_id)
      .maybeSingle();

    if (settings?.clocking_modes) {
      const modes = settings.clocking_modes as { web?: boolean; mobile?: boolean };
      const isWeb = body.device_info !== 'ios' && body.device_info !== 'android';
      const modeKey = isWeb ? 'web' : 'mobile';
      if (modes[modeKey] === false) {
        return c.json(
          { error: { code: 'mode_disabled', message: 'Modo de fichaje no habilitado para esta empresa' } },
          403
        );
      }
    }
  }

  const now = new Date();
  const todayStart = startOfDayISO(now);

  // Get last granted fichaje today to infer direction
  const { data: lastLog } = await supabaseAdmin
    .from('access_logs')
    .select('direction')
    .eq('user_id', user.id)
    .eq('event_type', 'granted')
    .gte('timestamp', todayStart)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Infer direction
  const direction: 'in' | 'out' =
    body.direction ?? ((!lastLog || lastLog.direction === 'out') ? 'in' : 'out');

  // Validate no consecutive duplicate
  if (lastLog && lastLog.direction === direction) {
    return c.json(
      {
        error: {
          code: 'duplicate_direction',
          message:
            direction === 'in'
              ? 'Ya tienes una entrada registrada sin salida'
              : 'Ya tienes una salida registrada sin entrada',
        },
      },
      422
    );
  }

  // Determine source from device_info (not from GPS)
  const source: 'web' | 'mobile' =
    body.device_info === 'ios' || body.device_info === 'android' ? 'mobile' : 'web';

  const detail_type = body.detail_type ?? inferDetailType(now.toISOString());

  // Geofence + schedule check
  let within_geofence: boolean | null = null;
  let out_of_schedule = false;

  if (user.company_id) {
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('headquarter_lat, headquarter_lon, geo_fence_radius, flexible_schedule_enabled, flexible_schedule_minutes, work_schedule_start, work_schedule_end, work_schedule_days')
      .eq('company_id', user.company_id)
      .maybeSingle();

    if (settings) {
      // Geofence (only when GPS coordinates provided)
      if (body.latitude !== undefined && body.longitude !== undefined &&
          settings.headquarter_lat && settings.headquarter_lon && settings.geo_fence_radius) {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const lat1 = toRad(Number(settings.headquarter_lat));
        const lat2 = toRad(body.latitude);
        const dLat = toRad(body.latitude - Number(settings.headquarter_lat));
        const dLon = toRad(body.longitude - Number(settings.headquarter_lon));
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        within_geofence = distance <= Number(settings.geo_fence_radius);
      }

      // Out-of-schedule check: only for day-start entry and day-end exit, never for breaks
      const isBreak = ['comida', 'descanso', 'medico', 'otro'].includes(detail_type);
      if (!isBreak && settings.flexible_schedule_enabled && settings.work_schedule_start && settings.work_schedule_end) {
        out_of_schedule = checkOutOfSchedule(
          now,
          direction,
          settings.work_schedule_start as string,
          settings.work_schedule_end as string,
          (settings.flexible_schedule_minutes as number | null) ?? 15,
          (settings.work_schedule_days as number[] | null) ?? [1, 2, 3, 4, 5],
        );
      }
    }
  }

  // Build insert payload
  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    event_type: 'granted',
    direction,
    detail_type,
    timestamp: now.toISOString(),
    source,
    device_info: body.device_info,
    out_of_schedule,
  };
  if (body.latitude !== undefined) insertPayload['latitude'] = body.latitude;
  if (body.longitude !== undefined) insertPayload['longitude'] = body.longitude;
  if (within_geofence !== null) insertPayload['within_geofence'] = within_geofence;

  const { data: log, error } = await supabaseAdmin
    .from('access_logs')
    .insert(insertPayload)
    .select('id, direction, timestamp, source, detail_type')
    .single();

  if (error || !log) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al registrar fichaje' } },
      500
    );
  }

  // Record for rate limiting only after successful insert
  recordFichaje(user.id);

  // Emit SSE to all active connections of this user
  sseBroadcaster.emit(user.id, {
    type: 'access_event',
    direction,
    timestamp: log.timestamp as string,
    source,
    detail_type,
  });

  // Emit to admin connections for this company
  if (user.company_id) {
    sseBroadcaster.emitToCompany(user.company_id, {
      type: 'access_event',
      user_id: user.id,
      direction,
      timestamp: log.timestamp as string,
      source,
      detail_type,
    });
  }

  return c.json({
    data: {
      id: log.id as string,
      direction,
      timestamp: log.timestamp as string,
      source,
      detail_type,
      is_inside: direction === 'in',
      within_geofence,
      out_of_schedule,
    },
  });
});

// ── GET /api/me/dashboard ─────────────────────────────────────────────────────
me.get('/dashboard', async (c) => {
  const user = c.get('user');
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const todayStr = toDateString(now);
  const weekStart = getWeekStart(now);

  // Fetch all logs for the current week (Mon 00:00 → now)
  const { data: weekLogs } = await supabaseAdmin
    .from('access_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('timestamp', weekStart.toISOString())
    .order('timestamp', { ascending: true });

  const logs = weekLogs ?? [];
  const todayLogs = logs.filter((l) => (l.timestamp as string).startsWith(todayStr));

  // Build Mon–Fri date array
  const weekDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(toDateString(d));
  }

  const weeklyBars = buildWeekBars(logs, weekDates);
  const todaySummary = calculateDaySummary(todayLogs);
  const todayDistribution = buildTodayDistribution(todayLogs);

  const week_total_minutes = weeklyBars.reduce((sum, d) => sum + d.minutes, 0);
  const days_worked_this_week = weeklyBars.filter((d) => d.minutes > 0).length;
  const daily_average_minutes =
    days_worked_this_week > 0
      ? Math.round(week_total_minutes / days_worked_this_week)
      : 0;

  const jornada_status = getJornadaStatus(todayLogs);

  const sortedLogs = [...todayLogs]
    .filter((l) => l.event_type !== 'denied')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const lastLog = sortedLogs.at(-1);
  const current_pause_type =
    jornada_status === 'paused' ? (lastLog?.detail_type ?? null) : null;

  // Inicio de la sesión actual: último fichaje 'in' del día (no el primero del día)
  const lastInLog = sortedLogs.filter((l) => l.direction === 'in').at(-1);

  return c.json({
    data: {
      week_total_minutes,
      days_worked_this_week,
      daily_average_minutes,
      is_inside: todaySummary.is_inside,
      jornada_status,
      current_pause_type,
      jornada_started_at: lastInLog?.timestamp ?? null,
      current_time: now.toISOString(),
      weekly_bars: weeklyBars,
      today_distribution: todayDistribution,
    },
  });
});

// ── GET /api/me/live (SSE) ────────────────────────────────────────────────────
me.get('/live', (c) => {
  const user = c.get('user');
  const encoder = new TextEncoder();

  type EmitFn = (event: Record<string, unknown>) => void;
  let emitFn: EmitFn | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      emitFn = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed — broadcaster will clean up on next emit
        }
      };

      sseBroadcaster.addConnection(user.id, emitFn);

      // Initial heartbeat
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
      );

      // Periodic heartbeat every 30s
      heartbeatId = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
          );
        } catch {
          if (heartbeatId) clearInterval(heartbeatId);
        }
      }, 30_000);
    },
    cancel() {
      if (heartbeatId) clearInterval(heartbeatId);
      if (emitFn) sseBroadcaster.removeConnection(user.id, emitFn);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

export default me;
