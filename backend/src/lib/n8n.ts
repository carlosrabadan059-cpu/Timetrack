// n8n webhook dispatcher
// Pattern: always insert into sync_queue first, then fire the webhook

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
