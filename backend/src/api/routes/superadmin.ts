import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { requireRole } from '../middleware/role.js';
import { createAcClient } from '../../lib/ac-client.js';
import type { AppVariables } from '../../types/api.types.js';
import type { ClockingModes } from '../../types/supabase.types.js';

const superadmin = new Hono<{ Variables: AppVariables }>();

superadmin.use('*', requireRole(['superadmin']));

// ── Zod schemas ───────────────────────────────────────────────────────────────

const clockingModesSchema = z.object({
  web: z.boolean().default(true),
  mobile: z.boolean().default(true),
  twoN: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(['ac', 'device']).nullable().default(null),
    ac_base_url: z.string().url().nullable().default(null),
    ac_api_token: z.string().nullable().default(null),
    device_webhook_secret: z.string().nullable().default(null),
  }).default({ enabled: false, type: null, ac_base_url: null, ac_api_token: null, device_webhook_secret: null }),
}).default({ web: true, mobile: true, twoN: { enabled: false, type: null, ac_base_url: null, ac_api_token: null, device_webhook_secret: null } });

const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  cif: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
  clocking_modes: clockingModesSchema,
  admin: z.object({
    full_name: z.string().min(1).max(200),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cif: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
});

// ── GET /api/superadmin/companies ─────────────────────────────────────────────

superadmin.get('/companies', async (c) => {
  const sb = getSupabaseAdmin();

  const { data: companies, error } = await sb
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: { code: 'db_error', message: error.message } }, 500);
  }

  // Attach settings to each company
  const companyIds = (companies ?? []).map((co) => co.id);
  const { data: settings } = await sb
    .from('company_settings')
    .select('company_id, company_name, clocking_modes')
    .in('company_id', companyIds);

  const settingsMap = new Map((settings ?? []).map((s) => [s.company_id, s]));

  const result = (companies ?? []).map((co) => ({
    ...co,
    settings: settingsMap.get(co.id) ?? null,
  }));

  return c.json({ data: result });
});

// ── POST /api/superadmin/companies ────────────────────────────────────────────

superadmin.post('/companies', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_params', message: 'Body inválido', details: parsed.error.flatten() } },
      400
    );
  }

  const { name, cif, address, email, clocking_modes, admin } = parsed.data;
  const sb = getSupabaseAdmin();
  const user = c.get('user');

  // Auto-generate device_webhook_secret if device mode requested
  const modes: ClockingModes = {
    ...clocking_modes,
    twoN: {
      ...clocking_modes.twoN,
      device_webhook_secret:
        clocking_modes.twoN.enabled && clocking_modes.twoN.type === 'device'
          ? (clocking_modes.twoN.device_webhook_secret ?? crypto.randomUUID())
          : clocking_modes.twoN.device_webhook_secret,
    },
  };

  // 1. Create company record
  const { data: company, error: companyErr } = await sb
    .from('companies')
    .insert({ name, cif: cif ?? null, address: address ?? null, email: email ?? null, created_by: user.id })
    .select()
    .single();

  if (companyErr || !company) {
    return c.json({ error: { code: 'company_create_failed', message: companyErr?.message ?? 'Error creando empresa' } }, 422);
  }

  // 2. Create company_settings
  const { error: settingsErr } = await sb.from('company_settings').insert({
    company_id: company.id,
    company_name: name,
    company_email: email ?? '',
    clocking_modes: modes,
  });

  if (settingsErr) {
    // Rollback company
    await sb.from('companies').delete().eq('id', company.id);
    return c.json({ error: { code: 'settings_create_failed', message: settingsErr.message } }, 422);
  }

  // 3. Create company in 2N AC if AC mode is enabled (best-effort, non-blocking)
  if (modes.twoN.enabled && modes.twoN.type === 'ac' && modes.twoN.ac_base_url && modes.twoN.ac_api_token) {
    try {
      const acClient = createAcClient(modes.twoN.ac_base_url, modes.twoN.ac_api_token);
      await acClient.createCompany({ Name: name });
    } catch (err) {
      console.warn(`[superadmin] Could not create company in 2N AC: ${(err as Error).message}`);
    }
  }

  // 4. Create admin user in Supabase Auth
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: admin.email,
    password: admin.password,
    email_confirm: true,
    user_metadata: { full_name: admin.full_name, company_id: company.id },
  });

  if (authErr || !authData.user) {
    await sb.from('company_settings').delete().eq('company_id', company.id);
    await sb.from('companies').delete().eq('id', company.id);
    return c.json({ error: { code: 'admin_create_failed', message: authErr?.message ?? 'Error creando admin' } }, 422);
  }

  // 5. Update profile with role=admin and company_id (trigger may have set defaults)
  await sb
    .from('profiles')
    .update({ role: 'admin', company_id: company.id, full_name: admin.full_name })
    .eq('id', authData.user.id);

  return c.json(
    {
      data: {
        company,
        clocking_modes: modes,
        admin_user_id: authData.user.id,
      },
    },
    201
  );
});

// ── GET /api/superadmin/companies/:id ─────────────────────────────────────────

superadmin.get('/companies/:id', async (c) => {
  const id = c.req.param('id');
  const sb = getSupabaseAdmin();

  const { data: company, error } = await sb
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !company) {
    return c.json({ error: { code: 'not_found', message: 'Empresa no encontrada' } }, 404);
  }

  const { data: settings } = await sb
    .from('company_settings')
    .select('*')
    .eq('company_id', id)
    .maybeSingle();

  const { data: users } = await sb
    .from('profiles')
    .select('id, full_name, email, role, employee_code, ac_synced_at, created_at')
    .eq('company_id', id)
    .order('created_at', { ascending: true });

  return c.json({ data: { ...company, settings, users: users ?? [] } });
});

// ── PATCH /api/superadmin/companies/:id ───────────────────────────────────────

superadmin.patch('/companies/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_params', message: 'Body inválido', details: parsed.error.flatten() } },
      400
    );
  }

  const sb = getSupabaseAdmin();

  const { data: company, error } = await sb
    .from('companies')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error || !company) {
    return c.json({ error: { code: 'not_found', message: 'Empresa no encontrada' } }, 404);
  }

  // Sync name to company_settings if provided
  if (parsed.data.name) {
    await sb
      .from('company_settings')
      .update({ company_name: parsed.data.name })
      .eq('company_id', id);
  }

  return c.json({ data: company });
});

export default superadmin;
