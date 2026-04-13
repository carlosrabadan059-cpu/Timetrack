import { Hono } from 'hono';
import type { AppVariables } from '../../types/api.types.js';

// TODO: implement in Fase 4 (GET /api/me/reportes/summary, activity, download)

const reportes = new Hono<{ Variables: AppVariables }>();

reportes.get('/summary', (c) => {
  return c.json({ error: { code: 'not_implemented', message: 'Fase 4 pendiente' } }, 501);
});

export default reportes;
