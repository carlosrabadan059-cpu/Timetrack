// n8n webhook dispatcher
// Pattern: always insert into sync_queue first, then fire the webhook

import { getSupabaseAdmin } from './supabase.js';
import type { SyncQueueEntry } from '../types/supabase.types.js';

const N8N_BASE = process.env['N8N_WEBHOOK_BASE_URL'] ?? '';
const N8N_SECRET = process.env['N8N_WEBHOOK_SECRET'] ?? '';

const WEBHOOK_PATHS = {
  'user-create': '/webhook/user-create',
  'user-update': '/webhook/user-update',
  'user-delete': '/webhook/user-delete',
  'credential-card': '/webhook/credential-card',
  'credential-pin': '/webhook/credential-pin',
  'incidencia-nueva': '/webhook/incidencia-nueva',
  'incidencia-resuelta': '/webhook/incidencia-resuelta',
  'vacacion-nueva': '/webhook/vacacion-nueva',
  'vacacion-resuelta': '/webhook/vacacion-resuelta',
} as const;

export type N8nWorkflow = keyof typeof WEBHOOK_PATHS;

export async function dispatchN8nWebhook(
  workflow: N8nWorkflow,
  payload: Record<string, unknown>
): Promise<void> {
  const path = WEBHOOK_PATHS[workflow];
  const url = `${N8N_BASE}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-Secret': N8N_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n webhook ${workflow} → ${res.status}: ${text}`);
  }
}

/**
 * Insert into sync_queue (mandatory when queueAction is provided), then fire the webhook.
 * - If queueAction is given: INSERT is required. Throws on INSERT failure.
 *   Webhook failures are caught, status updated to 'failed' (retry cron handles the rest).
 * - If queueAction is omitted (notification-only workflows like incidencia-*):
 *   No sync_queue entry. Webhook failure is logged but not re-thrown.
 */
export async function triggerWorkflow(
  workflow: N8nWorkflow,
  payload: Record<string, unknown>,
  queueAction?: SyncQueueEntry['action']
): Promise<void> {
  let queueId: string | null = null;

  if (queueAction) {
    const { data, error } = await getSupabaseAdmin()
      .from('sync_queue')
      .insert({ action: queueAction, payload, status: 'pending' })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(
        `sync_queue insert failed for ${workflow}: ${error?.message ?? 'no data'}`
      );
    }
    queueId = (data as { id: string }).id;
  }

  try {
    await dispatchN8nWebhook(workflow, queueId ? { ...payload, _queue_id: queueId } : payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Silencia 404 en workflows de notificación pura (sin queue) — workflow no configurado en n8n
    const is404 = msg.includes('→ 404');
    if (!queueId && is404) return;
    console.error(`[n8n] ${workflow} webhook failed:`, msg);

    if (queueId) {
      await getSupabaseAdmin()
        .from('sync_queue')
        .update({
          status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId);
    }
    // Don't re-throw — sync-retry cron will handle pending failures
  }
}
