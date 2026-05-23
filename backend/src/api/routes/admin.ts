import { Hono } from 'hono';
import crypto from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { requireRole } from '../middleware/role.js';
import { triggerWorkflow } from '../../lib/n8n.js';
import { restartCompanyConnection } from '../../services/signalr-listener.js';
import { createAcClient } from '../../lib/ac-client.js';
import type { AppVariables } from '../../types/api.types.js';
import type { ClockingModes } from '../../types/supabase.types.js';
import type { AcUser } from '../../types/ac.types.js';

const admin = new Hono<{ Variables: AppVariables }>();

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────

admin.get('/dashboard', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({
      data: { employees_total: 0, employees_working: 0, incidencias_pending: 0, recent_activity: [], employee_statuses: [] },
    });
  }

  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name, email, employee_code')
    .eq('company_id', user.company_id)
    .eq('role', 'employee')
    .order('full_name');

  const employees = profiles ?? [];
  const employeeIds = employees.map((e) => e.id);
  const fallback = '00000000-0000-0000-0000-000000000000';
  const idFilter = employeeIds.length > 0 ? employeeIds : [fallback];

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [{ data: todayLogs }, { count: pendingCount }, { data: recentLogs }] = await Promise.all([
    sb
      .from('access_logs')
      .select('user_id, direction, timestamp')
      .in('user_id', idFilter)
      .gte('timestamp', todayStart.toISOString())
      .order('timestamp', { ascending: false }),
    sb
      .from('incidencias')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.company_id)
      .eq('status', 'pending'),
    sb
      .from('access_logs')
      .select('id, user_id, direction, timestamp, source, detail_type')
      .in('user_id', idFilter)
      .order('timestamp', { ascending: false })
      .limit(8),
  ]);

  // Latest log per employee today
  const latestPerUser = new Map<string, { direction: string; timestamp: string }>();
  for (const log of todayLogs ?? []) {
    const uid = log.user_id as string;
    if (!latestPerUser.has(uid)) {
      latestPerUser.set(uid, { direction: log.direction as string, timestamp: log.timestamp as string });
    }
  }

  const profileMap = new Map(employees.map((e) => [e.id, e]));

  const employee_statuses = employees.map((emp) => {
    const latest = latestPerUser.get(emp.id);
    return {
      id: emp.id,
      full_name: emp.full_name,
      email: emp.email,
      employee_code: emp.employee_code,
      is_inside: latest?.direction === 'in',
      jornada_started_at: latest?.direction === 'in' ? latest.timestamp : null,
    };
  });

  const recent_activity = (recentLogs ?? []).map((l) => ({
    id: l.id,
    user_name: profileMap.get(l.user_id as string)?.full_name ?? 'Desconocido',
    direction: l.direction,
    timestamp: l.timestamp,
    source: l.source,
    detail_type: l.detail_type,
  }));

  return c.json({
    data: {
      employees_total: employees.length,
      employees_working: employee_statuses.filter((e) => e.is_inside).length,
      incidencias_pending: pendingCount ?? 0,
      recent_activity,
      employee_statuses,
    },
  });
});

// ── GET /api/admin/access-logs ────────────────────────────────────────────────

admin.get('/access-logs', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ data: [], meta: { page: 1, total: 0, has_more: false } });
  }

  const search = c.req.query('search') ?? '';
  const direction = c.req.query('direction') ?? 'all';
  const date = c.req.query('date');
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');
  const userId = c.req.query('user_id');
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '50')));
  const offset = (page - 1) * limit;

  // Resolve matching employee IDs for this company
  let profileQuery = sb
    .from('profiles')
    .select('id, full_name, email, employee_code')
    .eq('company_id', user.company_id);

  if (userId) {
    profileQuery = profileQuery.eq('id', userId);
  } else if (search) {
    profileQuery = profileQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: matchedProfiles } = await profileQuery;
  const matchingIds = (matchedProfiles ?? []).map((p) => p.id);

  if (matchingIds.length === 0) {
    return c.json({ data: [], meta: { page, total: 0, has_more: false } });
  }

  const profileMap = new Map((matchedProfiles ?? []).map((p) => [p.id, p]));

  let logsQuery = sb
    .from('access_logs')
    .select('id, user_id, direction, detail_type, timestamp, source, corrected, latitude, longitude, within_geofence', { count: 'exact' })
    .in('user_id', matchingIds)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (direction !== 'all') {
    logsQuery = logsQuery.eq('direction', direction);
  }

  if (date) {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);
    logsQuery = logsQuery.gte('timestamp', dayStart.toISOString()).lte('timestamp', dayEnd.toISOString());
  } else {
    if (dateFrom) {
      const f = new Date(dateFrom);
      f.setUTCHours(0, 0, 0, 0);
      logsQuery = logsQuery.gte('timestamp', f.toISOString());
    }
    if (dateTo) {
      const t = new Date(dateTo);
      t.setUTCHours(23, 59, 59, 999);
      logsQuery = logsQuery.lte('timestamp', t.toISOString());
    }
  }

  const { data: logs, error, count } = await logsQuery;

  if (error) {
    return c.json({ error: { code: 'internal_error', message: 'Error al obtener fichajes' } }, 500);
  }

  const total = count ?? 0;
  const items = (logs ?? []).map((l) => {
    const p = profileMap.get(l.user_id as string);
    return {
      id: l.id,
      user_id: l.user_id,
      user_name: p?.full_name ?? 'Desconocido',
      user_email: p?.email ?? '',
      employee_code: p?.employee_code ?? '',
      direction: l.direction,
      detail_type: l.detail_type,
      timestamp: l.timestamp,
      source: l.source,
      corrected: l.corrected,
      has_gps: !!(l.latitude && l.longitude),
      within_geofence: l.within_geofence ?? null,
    };
  });

  return c.json({ data: items, meta: { page, total, has_more: offset + limit < total } });
});

// ── GET /api/admin/settings ───────────────────────────────────────────────────

admin.get('/settings', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const { data, error } = await sb
    .from('company_settings')
    .select('*')
    .eq('company_id', user.company_id)
    .maybeSingle();

  if (error) {
    return c.json({ error: { code: 'internal_error', message: error.message } }, 500);
  }

  const defaultClockingModes: ClockingModes = {
    web: true,
    mobile: true,
    twoN: { enabled: false, type: null, ac_base_url: null, ac_api_token: null, device_webhook_secret: null },
  };

  if (!data) {
    return c.json({
      data: {
        company: { name: '', cif: '', address: '', email: '' },
        branches: [],
        rules: { geoFenceRadius: 100, courtesyMinutes: 15, latitude: 40.4168, longitude: -3.7038 },
        work_schedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
        holidays: [],
        clocking_modes: defaultClockingModes,
      },
    });
  }

  const rawModes = (data.clocking_modes ?? defaultClockingModes) as ClockingModes;
  // Never expose ac_api_token in plain text — mask it
  const safeModes: ClockingModes = {
    ...rawModes,
    twoN: {
      ...rawModes.twoN,
      ac_api_token: rawModes.twoN?.ac_api_token ? '••••••••' : null,
    },
  };

  return c.json({
    data: {
      company: {
        name: data.company_name,
        cif: data.company_cif,
        address: data.company_address,
        email: data.company_email,
      },
      branches: data.branches ?? [],
      rules: {
        geoFenceRadius: data.geo_fence_radius,
        courtesyMinutes: data.courtesy_minutes,
        latitude: Number(data.headquarter_lat),
        longitude: Number(data.headquarter_lon),
      },
      work_schedule: {
        start: data.work_schedule_start,
        end: data.work_schedule_end,
        days: data.work_schedule_days ?? [1, 2, 3, 4, 5],
      },
      holidays: data.holidays ?? [],
      clocking_modes: safeModes,
    },
  });
});

// ── PATCH /api/admin/settings ─────────────────────────────────────────────────

admin.patch('/settings', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: { code: 'invalid_body', message: 'Body inválido' } }, 400);
  }

  const patch: Record<string, unknown> = { company_id: user.company_id, updated_at: new Date().toISOString() };

  if (body.company) {
    if (body.company.name !== undefined) patch['company_name'] = String(body.company.name);
    if (body.company.cif !== undefined) patch['company_cif'] = String(body.company.cif);
    if (body.company.address !== undefined) patch['company_address'] = String(body.company.address);
    if (body.company.email !== undefined) patch['company_email'] = String(body.company.email);
  }
  if (body.branches !== undefined) patch['branches'] = body.branches;
  if (body.holidays !== undefined) patch['holidays'] = body.holidays;
  if (body.rules) {
    if (body.rules.geoFenceRadius !== undefined) patch['geo_fence_radius'] = Number(body.rules.geoFenceRadius);
    if (body.rules.courtesyMinutes !== undefined) patch['courtesy_minutes'] = Number(body.rules.courtesyMinutes);
    if (body.rules.latitude !== undefined) patch['headquarter_lat'] = Number(body.rules.latitude);
    if (body.rules.longitude !== undefined) patch['headquarter_lon'] = Number(body.rules.longitude);
  }
  if (body.work_schedule) {
    if (body.work_schedule.start !== undefined) patch['work_schedule_start'] = String(body.work_schedule.start);
    if (body.work_schedule.end !== undefined) patch['work_schedule_end'] = String(body.work_schedule.end);
    if (body.work_schedule.days !== undefined) patch['work_schedule_days'] = body.work_schedule.days;
  }

  let twoNSettingsChanged = false;
  if (body.clocking_modes !== undefined) {
    const incoming = body.clocking_modes as Partial<ClockingModes>;
    // Fetch current token so we can preserve it if the masked placeholder is sent
    const { data: current } = await sb
      .from('company_settings')
      .select('clocking_modes')
      .eq('company_id', user.company_id)
      .maybeSingle();
    const currentModes = (current?.clocking_modes ?? {}) as Partial<ClockingModes>;
    const currentToken = currentModes.twoN?.ac_api_token ?? null;

    const mergedToken =
      incoming.twoN?.ac_api_token && incoming.twoN.ac_api_token !== '••••••••'
        ? incoming.twoN.ac_api_token
        : currentToken;

    const newModes: ClockingModes = {
      web: incoming.web ?? currentModes.web ?? true,
      mobile: incoming.mobile ?? currentModes.mobile ?? true,
      twoN: {
        enabled: incoming.twoN?.enabled ?? currentModes.twoN?.enabled ?? false,
        type: incoming.twoN?.type !== undefined ? incoming.twoN.type : (currentModes.twoN?.type ?? null),
        ac_base_url: incoming.twoN?.ac_base_url !== undefined ? incoming.twoN.ac_base_url : (currentModes.twoN?.ac_base_url ?? null),
        ac_api_token: mergedToken,
        device_webhook_secret: incoming.twoN?.device_webhook_secret !== undefined
          ? incoming.twoN.device_webhook_secret
          : (currentModes.twoN?.device_webhook_secret ?? null),
      },
    };

    // Auto-generate secret if switching to device mode without a secret
    if (newModes.twoN.enabled && newModes.twoN.type === 'device' && !newModes.twoN.device_webhook_secret) {
      newModes.twoN.device_webhook_secret = crypto.randomUUID();
    }

    patch['clocking_modes'] = newModes;
    twoNSettingsChanged = true;
  }

  const { error } = await sb
    .from('company_settings')
    .upsert(patch, { onConflict: 'company_id' });

  if (error) {
    return c.json({ error: { code: 'internal_error', message: error.message } }, 500);
  }

  // Restart SignalR connection for this company if 2N settings changed
  if (twoNSettingsChanged) {
    void restartCompanyConnection(user.company_id);
  }

  return c.json({ data: { saved: true } });
});

// ── POST /api/admin/settings/test-ac ─────────────────────────────────────────

admin.post('/settings/test-ac', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const body = await c.req.json().catch(() => null) as { ac_base_url?: string; ac_api_token?: string } | null;

  let baseUrl = body?.ac_base_url?.trim() ?? '';
  let apiToken = body?.ac_api_token?.trim() ?? '';

  // If token is masked, fetch the real one from DB
  if (!apiToken || apiToken === '••••••••') {
    const { data: current } = await sb
      .from('company_settings')
      .select('clocking_modes')
      .eq('company_id', user.company_id)
      .maybeSingle();
    const modes = current?.clocking_modes as { twoN?: { ac_base_url?: string; ac_api_token?: string } } | null;
    if (!baseUrl) baseUrl = modes?.twoN?.ac_base_url ?? '';
    apiToken = modes?.twoN?.ac_api_token ?? '';
  }

  if (!baseUrl || !apiToken) {
    return c.json({ error: { code: 'missing_config', message: 'URL y token son obligatorios para probar la conexión' } }, 422);
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v3/users?limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return c.json({ error: { code: 'ac_error', message: `2N AC respondió con ${res.status}` } }, 502);
    }

    return c.json({ data: { connected: true, message: 'Conexión con 2N Access Commander establecida correctamente' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'ac_unreachable', message: `No se pudo conectar: ${msg}` } }, 502);
  }
});

// ── POST /api/admin/settings/import-from-ac ──────────────────────────────────
// Pulls all users from 2N AC and:
//   - Links by ExternalId or email when a Supabase profile already exists
//   - Creates a new auth user + profile for AC users not yet in the system
//   - Skips users already linked (ac_external_id already set)

admin.post('/settings/import-from-ac', requireRole(['admin']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  // Fetch stored AC credentials
  const { data: settingsRow } = await sb
    .from('company_settings')
    .select('clocking_modes')
    .eq('company_id', user.company_id)
    .maybeSingle();

  const modes = settingsRow?.clocking_modes as ClockingModes | null;
  const baseUrl = (modes?.twoN?.ac_base_url ?? '').trim();
  const apiToken = (modes?.twoN?.ac_api_token ?? '').trim();

  if (!baseUrl || !apiToken) {
    return c.json(
      { error: { code: 'missing_config', message: 'Guarda la URL y token de 2N AC antes de importar' } },
      422
    );
  }

  const ac = createAcClient(baseUrl, apiToken);

  let acUsers: AcUser[];
  try {
    acUsers = await ac.getUsers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'ac_error', message: `No se pudo conectar con 2N AC: ${msg}` } }, 502);
  }

  // Import company name from AC (best-effort — don't fail the whole import if this errors)
  let importedCompanyName: string | undefined;
  try {
    const companies = await ac.getCompanies();
    const acCompanyName = (companies[0]?.Name ?? companies[0]?.name as string | undefined)?.trim();
    if (acCompanyName) {
      const { error: nameErr } = await sb
        .from('company_settings')
        .upsert({ company_id: user.company_id, company_name: acCompanyName }, { onConflict: 'company_id' });
      if (!nameErr) importedCompanyName = acCompanyName;
    }
  } catch {
    // non-fatal
  }

  // Load all existing profiles for this company once to avoid N+1 queries
  const { data: existingProfiles } = await sb
    .from('profiles')
    .select('id, email, ac_external_id')
    .eq('company_id', user.company_id);

  const byAcId = new Map(
    (existingProfiles ?? []).filter((p) => p.ac_external_id).map((p) => [p.ac_external_id as string, p])
  );
  const byEmail = new Map(
    (existingProfiles ?? []).filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p])
  );

  let created = 0;
  let linked = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const acUser of acUsers) {
    try {
      // Already linked
      if (byAcId.has(acUser.Id)) {
        skipped++;
        continue;
      }

      const fullName = [acUser.FirstName, acUser.LastName].filter(Boolean).join(' ').trim() || 'Sin nombre';

      // Try to link by ExternalId (Supabase UUID stored in AC)
      if (acUser.ExternalId) {
        const { data: byExt } = await sb
          .from('profiles')
          .select('id')
          .eq('id', acUser.ExternalId)
          .eq('company_id', user.company_id)
          .maybeSingle();
        if (byExt) {
          await sb.from('profiles').update({
            ac_external_id: acUser.Id,
            ac_synced_at: new Date().toISOString(),
          }).eq('id', byExt.id);
          byAcId.set(acUser.Id, { id: byExt.id, email: acUser.Email ?? null, ac_external_id: acUser.Id });
          linked++;
          continue;
        }
      }

      // Try to link by email
      if (acUser.Email) {
        const existing = byEmail.get(acUser.Email.toLowerCase());
        if (existing) {
          await sb.from('profiles').update({
            ac_external_id: acUser.Id,
            ac_synced_at: new Date().toISOString(),
          }).eq('id', existing.id);
          byAcId.set(acUser.Id, { ...existing, ac_external_id: acUser.Id });
          linked++;
          continue;
        }
      }

      // Can't create without an email
      if (!acUser.Email) {
        skipped++;
        continue;
      }

      // Create new Supabase auth user + profile
      const tempPassword = crypto.randomUUID().replace(/-/g, '') + 'Aa1!';
      const { data: authData, error: authErr } = await sb.auth.admin.createUser({
        email: acUser.Email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, company_id: user.company_id },
      });

      if (authErr || !authData?.user) {
        // If the email already exists in auth, try to link the existing profile
        const isAlreadyExists =
          authErr?.message?.toLowerCase().includes('already') ||
          authErr?.code === 'user_already_exists' ||
          authErr?.status === 422;

        if (isAlreadyExists && acUser.Email) {
          const { data: existingProfile } = await sb
            .from('profiles')
            .select('id, company_id, ac_external_id')
            .ilike('email', acUser.Email)
            .maybeSingle();

          if (existingProfile?.company_id === user.company_id) {
            // Belongs to this company — just set ac_external_id
            await sb.from('profiles').update({
              ac_external_id: acUser.Id,
              ac_synced_at: new Date().toISOString(),
            }).eq('id', existingProfile.id);
            byAcId.set(acUser.Id, { id: existingProfile.id, email: acUser.Email, ac_external_id: acUser.Id });
            linked++;
          } else if (existingProfile && !existingProfile.company_id) {
            // Orphaned profile without company — assign here
            await sb.from('profiles').update({
              company_id: user.company_id,
              ac_external_id: acUser.Id,
              ac_synced_at: new Date().toISOString(),
            }).eq('id', existingProfile.id);
            byAcId.set(acUser.Id, { id: existingProfile.id, email: acUser.Email, ac_external_id: acUser.Id });
            linked++;
          } else {
            // User belongs to another company — skip
            skipped++;
          }
        } else {
          errors.push(`${fullName} <${acUser.Email}>: ${authErr?.message ?? 'Error al crear usuario'}`);
        }
        continue;
      }

      // Upsert profile — employee_code is assigned by the DB trigger (global sequence)
      const { error: upsertErr } = await sb.from('profiles').upsert(
        {
          id: authData.user.id,
          full_name: fullName,
          email: acUser.Email,
          company_id: user.company_id,
          role: 'employee',
          ac_external_id: acUser.Id,
          ac_synced_at: new Date().toISOString(),
          access_valid_from: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (upsertErr) {
        errors.push(`${fullName}: Error al crear perfil — ${upsertErr.message}`);
        continue;
      }

      byAcId.set(acUser.Id, { id: authData.user.id, email: acUser.Email, ac_external_id: acUser.Id });
      byEmail.set(acUser.Email.toLowerCase(), { id: authData.user.id, email: acUser.Email, ac_external_id: acUser.Id });
      created++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return c.json({
    data: {
      total_in_ac: acUsers.length,
      created,
      linked,
      skipped,
      company_name: importedCompanyName,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    },
  });
});

// ── POST /api/admin/sync-users ────────────────────────────────────────────────
// Queues user-create for all profiles without ac_external_id in this company.
// Safe to run multiple times — skips already-synced users.

admin.post('/sync-users', requireRole(['admin']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const { data: unsynced, error } = await sb
    .from('profiles')
    .select('id, full_name, email, company_id')
    .eq('company_id', user.company_id)
    .is('ac_external_id', null);

  if (error) {
    return c.json({ error: { code: 'internal_error', message: error.message } }, 500);
  }

  const profiles = (unsynced ?? []) as Array<{ id: string; full_name: string | null; email: string | null; company_id: string | null }>;

  if (profiles.length === 0) {
    return c.json({ data: { queued: 0, message: 'Todos los usuarios ya están sincronizados' } });
  }

  let queued = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const profile of profiles) {
    try {
      await triggerWorkflow(
        'user-create',
        {
          supabase_user_id: profile.id,
          full_name: profile.full_name ?? '',
          email: profile.email ?? '',
          company_id: profile.company_id ?? user.company_id,
        },
        'create_user'
      );
      queued++;
    } catch (err) {
      errors.push({ id: profile.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return c.json({ data: { queued, errors: errors.length > 0 ? errors : undefined } });
});

// ── POST /api/admin/api-keys ──────────────────────────────────────────────────
admin.post('/api-keys', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const body = await c.req.json().catch(() => null) as { name?: string; expires_at?: string; scopes?: string[] } | null;
  const name = body?.name?.trim();

  if (!name) {
    return c.json({ error: { code: 'invalid_body', message: 'El nombre de la API Key es obligatorio' } }, 400);
  }

  // Generar clave segura: tt_live_ + 32 hex aleatorios (16 bytes)
  const randomHex = crypto.randomBytes(16).toString('hex');
  const apiKey = `tt_live_${randomHex}`;
  const keyPrefix = apiKey.substring(0, 16); // tt_live_ + 8 caracteres aleatorios

  // Calcular hash SHA-256
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const expiresAt = body?.expires_at ? new Date(body.expires_at).toISOString() : null;
  const scopes = body?.scopes ?? ['fichajes:read'];

  const { data, error } = await sb
    .from('api_keys')
    .insert({
      company_id: user.company_id,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      is_active: true,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('id, name, key_prefix, scopes, is_active, expires_at, created_at')
    .single();

  if (error) {
    return c.json({ error: { code: 'internal_error', message: `Error al crear la API Key: ${error.message}` } }, 500);
  }

  // Retornar la API Key en texto plano solo una vez
  return c.json({
    data: {
      ...data,
      api_key: apiKey,
    },
  });
});

// ── GET /api/admin/api-keys ───────────────────────────────────────────────────
admin.get('/api-keys', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();

  if (!user.company_id) {
    return c.json({ data: [] });
  }

  const { data, error } = await sb
    .from('api_keys')
    .select('id, name, key_prefix, scopes, is_active, expires_at, created_at')
    .eq('company_id', user.company_id)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: { code: 'internal_error', message: `Error al listar las API Keys: ${error.message}` } }, 500);
  }

  return c.json({ data: data ?? [] });
});

// ── DELETE /api/admin/api-keys/:id ─────────────────────────────────────────────
admin.delete('/api-keys/:id', requireRole(['admin', 'manager']), async (c) => {
  const user = c.get('user');
  const sb = getSupabaseAdmin();
  const id = c.req.param('id');

  if (!user.company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  // Comprobar si pertenece a la misma empresa y eliminar (RLS asiste aquí, pero aseguramos en la cláusula)
  const { data: deleted, error } = await sb
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company_id)
    .select('id')
    .maybeSingle();

  if (error) {
    return c.json({ error: { code: 'internal_error', message: `Error al revocar la API Key: ${error.message}` } }, 500);
  }

  if (!deleted) {
    return c.json({ error: { code: 'not_found', message: 'API Key no encontrada o no pertenece a tu empresa' } }, 404);
  }

  return c.json({ data: { revoked: true, id } });
});

export default admin;
