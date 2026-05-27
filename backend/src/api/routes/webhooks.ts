import { Hono } from 'hono';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { acClient } from '../../lib/ac-client.js';
import { dispatchN8nWebhook, type N8nWorkflow } from '../../lib/n8n.js';
import { handleAccessEvent } from '../../services/signalr-listener.js';
import type { SyncQueueEntry, ClockingModes } from '../../types/supabase.types.js';

const webhooks = new Hono();

function safeCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifyN8nSecret(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return safeCompare(c.req.header('X-N8N-Secret'), process.env['N8N_WEBHOOK_SECRET']);
}

// ── POST /webhooks/n8n/callback ───────────────────────────────────────────────

const callbackSchema = z.object({
  workflow: z.string(),
  queue_id: z.string().uuid().optional(),
  supabase_user_id: z.string().uuid(),
  ac_external_id: z.string().optional(),
  status: z.enum(['success', 'failed']),
  error: z.string().optional(),
});

webhooks.post('/n8n/callback', async (c) => {
  if (!verifyN8nSecret(c)) {
    return c.json({ error: { code: 'unauthorized', message: 'Invalid secret' } }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_params', message: 'Body inválido', details: parsed.error.flatten() } },
      400
    );
  }

  const { workflow, queue_id, supabase_user_id, ac_external_id, status, error: errMsg } = parsed.data;
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  if (status === 'success') {
    if (ac_external_id) {
      await sb
        .from('profiles')
        .update({ ac_external_id, ac_synced_at: now })
        .eq('id', supabase_user_id);
    } else {
      await sb
        .from('profiles')
        .update({ ac_synced_at: now })
        .eq('id', supabase_user_id);
    }

    if (queue_id) {
      await sb
        .from('sync_queue')
        .update({ status: 'done', updated_at: now })
        .eq('id', queue_id);
    } else {
      await sb
        .from('sync_queue')
        .update({ status: 'done', updated_at: now })
        .eq('payload->>supabase_user_id', supabase_user_id)
        .in('status', ['pending', 'processing']);
    }

    return c.json({ data: { received: true } });
  }

  // status === 'failed'
  let queueRow: { id: string; retries: number } | null = null;

  if (queue_id) {
    const { data } = await sb
      .from('sync_queue')
      .select('id, retries')
      .eq('id', queue_id)
      .maybeSingle();
    queueRow = data as { id: string; retries: number } | null;
  } else {
    const { data } = await sb
      .from('sync_queue')
      .select('id, retries')
      .eq('payload->>supabase_user_id', supabase_user_id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    queueRow = data as { id: string; retries: number } | null;
  }

  if (!queueRow) {
    return c.json({ data: { received: true } });
  }

  if (queueRow.retries >= 5) {
    await sb
      .from('sync_queue')
      .update({ status: 'abandoned', error_message: errMsg ?? null, updated_at: now })
      .eq('id', queueRow.id);

    try {
      await sb.from('security_alerts').insert({
        alert_type: 'sync_failed',
        payload: { workflow, supabase_user_id, error: errMsg ?? null },
        created_at: now,
      });
    } catch {
      // Ignore — table may not exist
    }
  } else {
    await sb
      .from('sync_queue')
      .update({ status: 'failed', error_message: errMsg ?? null, updated_at: now })
      .eq('id', queueRow.id);
  }

  return c.json({ data: { received: true } });
});

// ── POST /webhooks/n8n/sync-retry ─────────────────────────────────────────────
// n8n cron every 15 min — retries failed sync_queue entries

const ACTION_TO_WORKFLOW: Record<SyncQueueEntry['action'], N8nWorkflow> = {
  create_user: 'user-create',
  update_user: 'user-update',
  delete_user: 'user-delete',
  assign_card: 'credential-card',
  revoke_card: 'credential-card',
  assign_pin: 'credential-pin',
  revoke_pin: 'credential-pin',
};

webhooks.post('/n8n/sync-retry', async (c) => {
  if (!verifyN8nSecret(c)) {
    return c.json({ error: { code: 'unauthorized', message: 'Invalid secret' } }, 401);
  }

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: failedRows, error } = await sb
    .from('sync_queue')
    .select('id, action, payload, retries')
    .eq('status', 'failed')
    .lt('retries', 5)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error || !failedRows || failedRows.length === 0) {
    return c.json({ data: { retried: 0 } });
  }

  const rows = failedRows as Array<Pick<SyncQueueEntry, 'id' | 'action' | 'payload' | 'retries'>>;

  let retried = 0;

  for (const row of rows) {
    const workflow = ACTION_TO_WORKFLOW[row.action];
    const dispatchPayload = { ...(row.payload as Record<string, unknown>), _queue_id: row.id };

    await sb
      .from('sync_queue')
      .update({ status: 'processing', retries: row.retries + 1, updated_at: now })
      .eq('id', row.id);

    try {
      await dispatchN8nWebhook(workflow, dispatchPayload);
      retried++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sb
        .from('sync_queue')
        .update({ status: 'failed', error_message: msg, updated_at: now })
        .eq('id', row.id);
    }
  }

  return c.json({ data: { retried } });
});

// ── POST /webhooks/n8n/reconcile ──────────────────────────────────────────────
// n8n cron 2:00 AM — reconcile Supabase profiles ↔ 2N AC users

webhooks.post('/n8n/reconcile', async (c) => {
  if (!verifyN8nSecret(c)) {
    return c.json({ error: { code: 'unauthorized', message: 'Invalid secret' } }, 401);
  }

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Fetch all profiles that should be synced to AC
  const { data: profiles, error: profilesErr } = await sb
    .from('profiles')
    .select('id, full_name, email, ac_external_id, company_id')
    .not('ac_external_id', 'is', null);

  if (profilesErr) {
    return c.json({ error: { code: 'internal_error', message: 'Error al obtener perfiles' } }, 500);
  }

  // Fetch all users from 2N AC
  let acUsers: { Id: string }[] = [];
  try {
    acUsers = await acClient.getUsers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'ac_unreachable', message: `Error al conectar con 2N AC: ${msg}` } }, 502);
  }

  const acIds = new Set(acUsers.map((u) => u.Id));

  const discrepancies: Array<{ supabase_user_id: string; issue: string }> = [];
  let queued = 0;

  for (const profile of profiles ?? []) {
    if (!profile.ac_external_id) continue;

    if (!acIds.has(profile.ac_external_id)) {
      discrepancies.push({ supabase_user_id: profile.id, issue: 'missing_in_ac' });

      // Queue a re-create
      const { data: queueRow } = await sb
        .from('sync_queue')
        .insert({
          action: 'create_user',
          payload: {
            supabase_user_id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            company_id: profile.company_id,
          },
          status: 'pending',
          created_at: now,
        })
        .select('id')
        .single();

      if (queueRow) {
        try {
          await dispatchN8nWebhook('user-create', {
            supabase_user_id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            company_id: profile.company_id,
            _queue_id: (queueRow as { id: string }).id,
          });
          queued++;
        } catch {
          // sync-retry cron will pick it up
        }
      }
    }
  }

  return c.json({ data: { queued, discrepancies } });
});

// ── POST /webhooks/2n-device/:companyId ───────────────────────────────────────
// Webhook recibido directamente desde un lector 2N (modo Dispositivo Directo).
// Auth: X-2N-Secret header debe coincidir con clocking_modes.twoN.device_webhook_secret
// de la empresa. El cuerpo acepta el mismo formato plano/nativo que Node-RED.

webhooks.post('/2n-device/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const sb = getSupabaseAdmin();

  const { data: settings } = await sb
    .from('company_settings')
    .select('clocking_modes')
    .eq('company_id', companyId)
    .single();

  if (!settings) {
    return c.json({ error: { code: 'not_found', message: 'Empresa no encontrada' } }, 404);
  }

  const modes = settings.clocking_modes as ClockingModes;

  if (!modes?.twoN?.enabled || modes.twoN.type !== 'device') {
    return c.json({ error: { code: 'mode_disabled', message: 'Modo dispositivo directo no habilitado' } }, 403);
  }

  const secret = c.req.header('X-2N-Secret');
  if (!safeCompare(secret, modes.twoN.device_webhook_secret ?? undefined)) {
    return c.json({ error: { code: 'unauthorized', message: 'Secret inválido' } }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: { code: 'invalid_params', message: 'Body inválido' } }, 400);
  }

  await handleAccessEvent(body as Record<string, unknown>, companyId);
  return c.json({ data: { received: true } });
});

// ── POST /webhooks/node-red/access-event ──────────────────────────────────────
// Node-RED (running inside 2N AC) forwards access events here.
// Node-RED subscribes to the SignalR hub natively (with local auth) and POSTs
// each event. Auth: X-Node-Red-Secret header matches NODE_RED_SECRET env var.

// Accept both flat (our tests) and native 2N AC format (Category/Person/Device/...)
const nodeRedEventSchema = z.record(z.string(), z.unknown());

webhooks.post('/node-red/access-event', async (c) => {
  const secret = c.req.header('X-Node-Red-Secret');
  if (!safeCompare(secret, process.env['NODE_RED_SECRET'])) {
    return c.json({ error: { code: 'unauthorized', message: 'Invalid secret' } }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: { code: 'invalid_params', message: 'Body inválido' } }, 400);
  }

  await handleAccessEvent(body as Record<string, unknown>);
  return c.json({ data: { received: true } });
});

export default webhooks;
