// Sync queue logic is implemented in lib/n8n.ts via triggerWorkflow().
// Use triggerWorkflow(workflow, payload, queueAction) for all sync operations —
// it inserts into sync_queue first, then dispatches to n8n.
// Retries are handled by the /webhooks/n8n/sync-retry endpoint (n8n cron every 15 min).
// Nightly reconciliation runs via /webhooks/n8n/reconcile (n8n cron 2:00 AM).

export { triggerWorkflow, dispatchN8nWebhook } from '../lib/n8n.js';
