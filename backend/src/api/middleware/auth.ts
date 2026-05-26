import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AuthUser, AppVariables } from '../../types/api.types.js';

export const auth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json(
      { error: { code: 'unauthorized', message: 'Token requerido' } },
      401
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json(
      { error: { code: 'unauthorized', message: 'Token inválido o expirado' } },
      401
    );
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, company_id, ac_external_id, employee_code, ac_synced_at')
    .eq('id', user.id)
    .single();

  const VALID_ROLES = ['superadmin', 'admin', 'manager', 'employee'] as const;
  const rawRole = profile?.role ?? 'employee';
  const validatedRole = (VALID_ROLES as readonly string[]).includes(rawRole)
    ? (rawRole as AuthUser['role'])
    : 'employee';

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? '',
    role: validatedRole,
    company_id: profile?.company_id ?? null,
    ac_external_id: profile?.ac_external_id ?? null,
    employee_code: profile?.employee_code ?? null,
    ac_synced: !!profile?.ac_synced_at,
  };

  c.set('user', authUser);
  await next();
});

// Keep backward-compatible named export used in index.ts
export { auth as authMiddleware };
