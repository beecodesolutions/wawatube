import type { FastifyInstance } from 'fastify';
import { ApiFailure } from '../http/errors.js';
import {
  configuredPin,
  createSession,
  revokeSession,
  validSession,
  verifyPin,
} from './service.js';
import type { Database } from '../db/index.js';
import type { AppConfig } from '../config.js';
import { loginBody } from '../http/schemas.js';

const cookieName = 'wawatube_session';
const cookieOptions = (config: AppConfig) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.secureCookies,
  path: '/',
  maxAge: config.sessionHours * 60 * 60,
});
const attempts = new Map<string, { count: number; resetAt: number }>();

export function sessionToken(request: {
  cookies: Record<string, string | undefined>;
}) {
  return request.cookies[cookieName];
}

export async function requireAdmin(
  request: { cookies: Record<string, string | undefined> },
  _reply: unknown,
  db: Database,
): Promise<void> {
  if (!(await validSession(db, sessionToken(request))))
    throw new ApiFailure(401, 'UNAUTHORIZED');
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
): void {
  app.get('/api/admin/auth/session', async (request) => ({
    authenticated: await validSession(db, sessionToken(request)),
    pinRequired: !config.skipParentPin,
  }));
  app.post<{ Body: { pin: string } }>(
    '/api/admin/auth/login',
    { schema: loginBody },
    async (request, reply) => {
      const key = request.ip;
      const current = attempts.get(key);
      const now = Date.now();
      if (
        !config.skipParentPin &&
        current &&
        current.resetAt > now &&
        current.count >= 5
      )
        return reply.code(429).send({ code: 'LOGIN_THROTTLED' });
      const pin = request.body?.pin;
      const hash = config.skipParentPin ? null : await configuredPin(db);
      if (
        !config.skipParentPin &&
        (!pin || !hash || !(await verifyPin(pin, hash)))
      ) {
        const next =
          current && current.resetAt > now
            ? { count: current.count + 1, resetAt: current.resetAt }
            : { count: 1, resetAt: now + 60_000 };
        attempts.set(key, next);
        return reply.code(401).send({ code: 'INVALID_PIN' });
      }
      attempts.delete(key);
      const session = await createSession(db, config.sessionHours);
      reply.setCookie(cookieName, session.token, {
        ...cookieOptions(config),
        expires: session.expiresAt,
      });
      return reply.code(204).send();
    },
  );
  app.post('/api/admin/auth/logout', async (request, reply) => {
    await revokeSession(db, sessionToken(request));
    reply.clearCookie(cookieName, { path: '/' });
    return reply.code(204).send();
  });
}
