import { Hono } from 'hono';
import type { AppVariables } from '../../types/api.types.js';

// TODO: implement in Fase 3 (GET /api/me/incidencias, POST /api/me/incidencias)

const incidencias = new Hono<{ Variables: AppVariables }>();

incidencias.get('/', (c) => {
  return c.json({ error: { code: 'not_implemented', message: 'Fase 3 pendiente' } }, 501);
});

export default incidencias;
