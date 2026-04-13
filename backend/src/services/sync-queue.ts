// n8n sync queue processor
// Handles retries for failed webhook dispatches
// TODO: implement in Fase 5

import { supabaseAdmin } from '../lib/supabase.js';
import { dispatchN8nWebhook, type N8nWorkflow } from '../lib/n8n.js';

export type EnqueueParams = {
  action: string;
  workflow: N8nWorkflow;
  payload: Record<string, unknown>;
};

/**
 * Inserts a record into sync_queue and fires the n8n webhook.
 * The queue entry tracks the outcome via the /webhooks/n8n/callback endpoint.
 */
export async function enqueueAndDispatch(params: EnqueueParams): Promise<void> {
  // 1. Insert into sync_queue with status 'pending'
  const { error: insertError } = await supabaseAdmin.from('sync_queue').insert({
    action: params.action,
    payload: params.payload,
    status: 'pending',
  });

  if (insertError) {
    throw new Error(`sync_queue insert failed: ${insertError.message}`);
  }

  // 2. Fire webhook to n8n
  await dispatchN8nWebhook(params.workflow, params.payload);
}
