import { Hono } from 'hono';

// TODO: implement in Fase 3/5
// POST /webhooks/n8n/callback  — resultado de workflows n8n
// POST /webhooks/node-red/*    — automaciones Node-RED

const webhooks = new Hono();

webhooks.post('/n8n/callback', (c) => {
  return c.json({ error: { code: 'not_implemented', message: 'Fase 3/5 pendiente' } }, 501);
});

export default webhooks;
