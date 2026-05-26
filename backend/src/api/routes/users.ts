import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { requireRole } from '../middleware/role.js';
import { triggerWorkflow } from '../../lib/n8n.js';
import type { AppVariables } from '../../types/api.types.js';
import type { Profile } from '../../types/supabase.types.js';

const users = new Hono<{ Variables: AppVariables }>();

// ── POST /api/users ───────────────────────────────────────────────────────────

const createUserSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  group_id: z.string().optional(),
});

users.post('/', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const company_id = authUser.company_id;

  if (!company_id) {
    return c.json({ error: { code: 'no_company', message: 'Sin empresa asociada' } }, 422);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'invalid_params',
          message: 'Body inválido',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }
  const { full_name, email, group_id } = parsed.data;

  const sb = getSupabaseAdmin();

  // Generate a temporary password — user must reset via email
  const tempPassword = crypto.randomUUID().replace(/-/g, '') + 'Aa1!';

  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name, company_id },
  });

  if (authErr) {
    return c.json(
      { error: { code: 'user_create_failed', message: authErr.message } },
      422
    );
  }

  const supabase_user_id = authData.user.id;

  // Profile is created by DB trigger — should exist immediately after auth.admin.createUser
  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', supabase_user_id)
    .maybeSingle();

  try {
    await triggerWorkflow(
      'user-create',
      { supabase_user_id, full_name, email, company_id, group_id: group_id ?? null },
      'create_user'
    );
  } catch (err) {
    console.error('[users] triggerWorkflow user-create failed:', err);
    // User created in Supabase but sync failed — return 207 with sync status
    return c.json(
      { data: { user: profile, sync_status: 'failed' } },
      207 as Parameters<typeof c.json>[1]
    );
  }

  return c.json({ data: { user: profile, sync_status: 'pending' } }, 201);
});

// ── GET /api/users ────────────────────────────────────────────────────────────

users.get('/', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');

  if (!authUser.company_id) {
    return c.json({ data: [], meta: { page: 1, total: 0, has_more: false } });
  }

  const role = c.req.query('role');
  const search = c.req.query('search');
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const sb = getSupabaseAdmin();
  let query = sb
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('company_id', authUser.company_id)
    .order('full_name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (role && ['admin', 'manager', 'employee'].includes(role)) {
    query = query.eq('role', role);
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al obtener usuarios' } },
      500
    );
  }

  const profiles = (data ?? []) as Profile[];
  const items = profiles.map((p) => ({
    ...p,
    ac_synced: !!p.ac_external_id && !!p.ac_synced_at,
  }));

  return c.json({
    data: items,
    meta: { page, total: count ?? 0, has_more: offset + limit < (count ?? 0) },
  });
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────

users.get('/:id', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }

  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }

  const { data: lastLog } = await sb
    .from('access_logs')
    .select('id, direction, timestamp, source')
    .eq('user_id', id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: pendingCount } = await sb
    .from('sync_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'processing'])
    .eq('payload->>supabase_user_id', id);

  return c.json({
    data: {
      ...(profile as Profile),
      ac_synced: !!profile.ac_external_id && !!profile.ac_synced_at,
      last_access: lastLog ?? null,
      sync_status: {
        pending_actions: pendingCount ?? 0,
      },
    },
  });
});

// ── GET /api/users/:id/sync-status ───────────────────────────────────────────

users.get('/:id/sync-status', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile, error } = await sb
    .from('profiles')
    .select('ac_external_id, ac_synced_at, company_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }

  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }

  const [{ count: pendingCount }, { data: lastFailed }] = await Promise.all([
    sb
      .from('sync_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing'])
      .eq('payload->>supabase_user_id', id),
    sb
      .from('sync_queue')
      .select('error_message')
      .eq('payload->>supabase_user_id', id)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return c.json({
    data: {
      ac_synced: !!profile.ac_external_id && !!profile.ac_synced_at,
      ac_external_id: profile.ac_external_id ?? null,
      ac_synced_at: profile.ac_synced_at ?? null,
      pending_actions: pendingCount ?? 0,
      last_error: lastFailed?.error_message ?? null,
    },
  });
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────

const patchUserSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  access_valid_from: z.string().datetime().nullable().optional(),
  access_valid_to: z.string().datetime().nullable().optional(),
  notifications_email: z.boolean().optional(),
});

users.patch('/:id', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();

  const body = await c.req.json().catch(() => null);
  const parsed = patchUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'invalid_params',
          message: 'Body inválido',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const sb = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (existing.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }

  const changes: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.full_name !== undefined) changes['full_name'] = d.full_name;
  if (d.role !== undefined) changes['role'] = d.role;
  if (d.access_valid_from !== undefined) changes['access_valid_from'] = d.access_valid_from;
  if (d.access_valid_to !== undefined) changes['access_valid_to'] = d.access_valid_to;
  if (d.notifications_email !== undefined) changes['notifications_email'] = d.notifications_email;

  if (Object.keys(changes).length === 0) {
    return c.json({ error: { code: 'bad_request', message: 'Sin campos a actualizar' } }, 400);
  }

  const { data: updated, error: updateErr } = await sb
    .from('profiles')
    .update(changes)
    .eq('id', id)
    .select('*')
    .single();

  if (updateErr || !updated) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al actualizar usuario' } },
      500
    );
  }

  if (existing.ac_external_id) {
    void triggerWorkflow(
      'user-update',
      { supabase_user_id: id, ac_external_id: existing.ac_external_id, changes },
      'update_user'
    );
  }

  return c.json({ data: updated });
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────

users.delete('/:id', requireRole(['admin']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (existing.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }

  // Soft delete: revoke access by setting access_valid_to = now()
  const { error: softDeleteErr } = await sb
    .from('profiles')
    .update({ access_valid_to: new Date().toISOString() })
    .eq('id', id);

  if (softDeleteErr) {
    return c.json(
      { error: { code: 'internal_error', message: 'Error al revocar acceso' } },
      500
    );
  }

  void triggerWorkflow(
    'user-delete',
    { supabase_user_id: id, ac_external_id: existing.ac_external_id ?? null },
    'delete_user'
  );

  return c.json({ data: { deleted: true } });
});

// ── POST /api/users/:id/cards ─────────────────────────────────────────────────

const assignCardSchema = z.object({
  card_number: z.string().min(1).max(50),
});

users.post('/:id/cards', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (!profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }
  if (!profile.ac_external_id) {
    return c.json({ error: { code: 'not_synced', message: 'Usuario no sincronizado con 2N AC' } }, 422);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = assignCardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_params', message: 'Body inválido', details: parsed.error.flatten() } },
      400
    );
  }

  try {
    await triggerWorkflow(
      'credential-card',
      { supabase_user_id: id, ac_external_id: profile.ac_external_id, action: 'assign', card_number: parsed.data.card_number },
      'assign_card'
    );
  } catch (err) {
    console.error('[users] triggerWorkflow credential-card assign failed:', err);
    return c.json({ error: { code: 'sync_error', message: 'Error al encolar asignación de tarjeta' } }, 500);
  }

  return c.json({ data: { queued: true, action: 'assign_card' } }, 202);
});

// ── DELETE /api/users/:id/cards/:cardId ───────────────────────────────────────

users.delete('/:id/cards/:cardId', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id, cardId } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (!profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }
  if (!profile.ac_external_id) {
    return c.json({ error: { code: 'not_synced', message: 'Usuario no sincronizado con 2N AC' } }, 422);
  }

  try {
    await triggerWorkflow(
      'credential-card',
      { supabase_user_id: id, ac_external_id: profile.ac_external_id, action: 'revoke', card_id: cardId },
      'revoke_card'
    );
  } catch (err) {
    console.error('[users] triggerWorkflow credential-card revoke failed:', err);
    return c.json({ error: { code: 'sync_error', message: 'Error al encolar revocación de tarjeta' } }, 500);
  }

  return c.json({ data: { queued: true, action: 'revoke_card' } });
});

// ── POST /api/users/:id/pin ───────────────────────────────────────────────────

const assignPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'El PIN debe tener entre 4 y 8 dígitos'),
});

users.post('/:id/pin', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (!profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }
  if (!profile.ac_external_id) {
    return c.json({ error: { code: 'not_synced', message: 'Usuario no sincronizado con 2N AC' } }, 422);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = assignPinSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_params', message: parsed.error.issues[0]?.message ?? 'Body inválido' } },
      400
    );
  }

  try {
    await triggerWorkflow(
      'credential-pin',
      { supabase_user_id: id, ac_external_id: profile.ac_external_id, action: 'assign', pin: parsed.data.pin },
      'assign_pin'
    );
  } catch (err) {
    console.error('[users] triggerWorkflow credential-pin assign failed:', err);
    return c.json({ error: { code: 'sync_error', message: 'Error al encolar asignación de PIN' } }, 500);
  }

  return c.json({ data: { queued: true, action: 'assign_pin' } }, 202);
});

// ── DELETE /api/users/:id/pin ─────────────────────────────────────────────────

users.delete('/:id/pin', requireRole(['admin', 'manager']), async (c) => {
  const authUser = c.get('user');
  const { id } = c.req.param();
  const sb = getSupabaseAdmin();

  const { data: profile } = await sb
    .from('profiles')
    .select('company_id, ac_external_id')
    .eq('id', id)
    .maybeSingle();

  if (!profile) {
    return c.json({ error: { code: 'not_found', message: 'Usuario no encontrado' } }, 404);
  }
  if (profile.company_id !== authUser.company_id) {
    return c.json({ error: { code: 'forbidden', message: 'Usuario de otra empresa' } }, 403);
  }
  if (!profile.ac_external_id) {
    return c.json({ error: { code: 'not_synced', message: 'Usuario no sincronizado con 2N AC' } }, 422);
  }

  try {
    await triggerWorkflow(
      'credential-pin',
      { supabase_user_id: id, ac_external_id: profile.ac_external_id, action: 'revoke' },
      'revoke_pin'
    );
  } catch (err) {
    console.error('[users] triggerWorkflow credential-pin revoke failed:', err);
    return c.json({ error: { code: 'sync_error', message: 'Error al encolar revocación de PIN' } }, 500);
  }

  return c.json({ data: { queued: true, action: 'revoke_pin' } });
});

export default users;
