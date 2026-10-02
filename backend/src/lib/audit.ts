import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from './supabase.js';
import type { AppVariables } from '../types/api.types.js';

export type AuditAction =
  | 'DATA_VIEW'
  | 'DATA_EXPORT'
  | 'CORRECTION_APPLY'
  | 'INCIDENT_APPROVE'
  | 'INCIDENT_REJECT'
  | 'CONFIG_CHANGE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'USER_REACTIVATE'
  | 'CREDENTIAL_CHANGE'
  | 'API_KEY_CHANGE'
  | 'SYNC_RUN'
  | 'SUPERADMIN_ACTION'
  | 'EXTERNAL_API_ACCESS';

export interface AuditEvent {
  actorId: string | null;
  companyId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Appends an event to audit_events (append-only, kept 4 years — art. 5.2 and 32 GDPR).
 * Never throws: a failed audit write is logged but must not break the user's request.
 */
export async function recordAudit(e: AuditEvent): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from('audit_events').insert({
      actor_user_id: e.actorId,
      company_id: e.companyId,
      action: e.action,
      entity_type: e.entityType,
      entity_id: e.entityId && UUID_RE.test(e.entityId) ? e.entityId : null,
      payload: e.payload ?? {},
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (err) {
    console.error('[audit] insert failed:', err);
  }
}

type JsonBody = Record<string, unknown>;

interface AuditedOptions {
  /** Body fields whose values are safe to store (never secrets, PINs or card numbers). */
  bodyFields?: string[];
  /** Store the names (not values) of the fields sent in the body. */
  bodyKeys?: boolean;
  /** The entity is a company: attribute the event to it so that company's admins see it. */
  entityIsCompany?: boolean;
}

/**
 * Route middleware: records the event after the handler succeeds (status < 400).
 * Stores method, path and query params; from the body only what the options allow.
 */
export function audited(
  action: AuditAction | ((body: JsonBody) => AuditAction),
  entityType: string,
  opts: AuditedOptions = {}
) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    let body: JsonBody = {};
    if (c.req.method !== 'GET' && c.req.method !== 'DELETE') {
      // HonoRequest caches the parsed body, so the handler can still read it
      try { body = (await c.req.json()) as JsonBody; } catch { /* empty or non-JSON body */ }
    }

    await next();
    if (c.res.status >= 400) return;

    const user = c.get('user') as AppVariables['user'] | undefined;
    const query = c.req.query();
    const entityId = c.req.param('id') ?? c.req.path.match(UUID_IN_PATH)?.[0] ?? null;
    const fields = Object.fromEntries((opts.bodyFields ?? []).filter((k) => k in body).map((k) => [k, body[k]]));

    await recordAudit({
      actorId: user?.id ?? null,
      companyId: (opts.entityIsCompany ? entityId : null) ?? user?.company_id ?? c.get('companyId') ?? null,
      action: typeof action === 'function' ? action(body) : action,
      entityType,
      entityId,
      payload: {
        method: c.req.method,
        path: c.req.path,
        ...(Object.keys(query).length ? { query } : {}),
        ...(Object.keys(fields).length ? { fields } : {}),
        ...(opts.bodyKeys && Object.keys(body).length ? { changed: Object.keys(body) } : {}),
      },
    });
  });
}

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
