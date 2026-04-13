import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

let _public: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

/** Public client — respects RLS, use for user-scoped queries */
export function getSupabasePublic(): SupabaseClient {
  if (!_public) {
    _public = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'));
  }
  return _public;
}

/**
 * Admin client — bypasses RLS (service_role key).
 * NEVER expose this to the browser or return its credentials to the client.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

// Convenience aliases used throughout the codebase
export const supabasePublic = new Proxy({} as SupabaseClient, {
  get: (_, prop) => getSupabasePublic()[prop as keyof SupabaseClient],
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_, prop) => getSupabaseAdmin()[prop as keyof SupabaseClient],
});
