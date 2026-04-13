import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { authMiddleware } from './api/middleware/auth.js';
import meRoutes from './api/routes/me.js';
import historialRoutes from './api/routes/historial.js';
import incidenciasRoutes from './api/routes/incidencias.js';
import reportesRoutes from './api/routes/reportes.js';
import webhookRoutes from './api/routes/webhooks.js';
import type { AppVariables } from './types/api.types.js';
import { startSignalRListener } from './services/signalr-listener.js';

const app = new Hono<{ Variables: AppVariables }>();

// ── Global middleware ──────────────────────────────────────────────────────────
app.use('*', logger());

// ── Public endpoints ───────────────────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Webhook endpoints (own auth via X-N8N-Secret / X-Node-Red-Secret) ─────────
app.route('/webhooks', webhookRoutes);

// ── Protected API ──────────────────────────────────────────────────────────────
app.use('/api/*', authMiddleware);

app.route('/api/me', meRoutes);
app.route('/api/me/historial', historialRoutes);
app.route('/api/me/incidencias', incidenciasRoutes);
app.route('/api/me/reportes', reportesRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: { code: 'not_found', message: `${c.req.path} not found` } }, 404);
});

// ── Start server ───────────────────────────────────────────────────────────────
const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[server] Running on http://localhost:${port}`);
  console.log(`[server] NODE_ENV=${process.env['NODE_ENV'] ?? 'development'}`);
  void startSignalRListener();
});

export default app;
