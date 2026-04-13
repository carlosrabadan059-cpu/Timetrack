import { createMiddleware } from 'hono/factory';
import type { UserRole, AppVariables } from '../../types/api.types.js';

export function requireRole(roles: UserRole[]) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get('user');

    if (!roles.includes(user.role)) {
      return c.json(
        {
          error: {
            code: 'forbidden',
            message: `Permisos insuficientes. Rol requerido: ${roles.join(' o ')}`,
          },
        },
        403
      );
    }

    await next();
  });
}
