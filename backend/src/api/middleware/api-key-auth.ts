import { createHash } from 'crypto';
import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { AppVariables } from '../../types/api.types.js';

export const apiKeyAuthMiddleware = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Falta o es inválido el token Bearer en la cabecera Authorization',
        },
      },
      401
    );
  }

  const apiKey = authHeader.substring(7).trim();
  if (!apiKey.startsWith('tt_live_')) {
    return c.json(
      {
        error: {
          code: 'invalid_key_format',
          message: 'Formato de API Key no válido. Debe comenzar con "tt_live_"',
        },
      },
      400
    );
  }

  // Generar hash SHA-256 de la API Key suministrada
  const incomingHash = createHash('sha256').update(apiKey).digest('hex');

  const sb = getSupabaseAdmin();
  const { data: keyData, error } = await sb
    .from('api_keys')
    .select('company_id, scopes, is_active, expires_at')
    .eq('key_hash', incomingHash)
    .maybeSingle();

  if (error || !keyData) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'API Key inválida o inexistente',
        },
      },
      401
    );
  }

  if (!keyData.is_active) {
    return c.json(
      {
        error: {
          code: 'key_disabled',
          message: 'Esta API Key ha sido desactivada',
        },
      },
      403
    );
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return c.json(
      {
        error: {
          code: 'key_expired',
          message: 'Esta API Key ha expirado',
        },
      },
      403
    );
  }

  // Establecer las variables del contexto seguro
  c.set('companyId', keyData.company_id);
  c.set('apiScopes', keyData.scopes as string[]);

  await next();
});
