import { createMiddleware } from 'hono/factory';
import type { AppVariables } from '../../types/api.types.js';

// In-memory store per userId → last successful fichaje timestamp
// TODO: replace with Redis for multi-instance deployments
const fichajeTimestamps = new Map<string, number>();

const FICHAJE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Rate limiter for POST /api/me/fichar.
 * Allows at most 1 fichaje per user every 5 minutes.
 * Must be used AFTER authMiddleware.
 */
export const fichajeRateLimit = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const user = c.get('user');
    const now = Date.now();
    const last = fichajeTimestamps.get(user.id);

    if (last !== undefined && now - last < FICHAJE_WINDOW_MS) {
      const retryAfterSec = Math.ceil((FICHAJE_WINDOW_MS - (now - last)) / 1000);
      c.header('Retry-After', String(retryAfterSec));
      return c.json(
        {
          error: {
            code: 'rate_limit',
            message: `Espera ${retryAfterSec}s antes de fichar de nuevo`,
          },
        },
        429
      );
    }

    await next();
  }
);

/**
 * Records a successful fichaje for the given user.
 * Call this only after a fichaje has been committed to the DB.
 */
export function recordFichaje(userId: string): void {
  fichajeTimestamps.set(userId, Date.now());
}
