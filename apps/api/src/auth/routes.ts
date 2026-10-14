import { meResponseSchema } from '@tableau-clair/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from './auth';

/** En-têtes Fastify → `Headers` Web, que Better Auth attend. */
export function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, value);
  }
  return headers;
}

/** Monte `/api/auth/*` (Better Auth) et `/api/me` sur l'instance Fastify. */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth, appUrl: string) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, appUrl);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: toWebHeaders(request),
          ...(hasBody ? { body: JSON.stringify(request.body ?? {}) } : {}),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(Buffer.from(await response.arrayBuffer()));
    },
  });

  app.get('/api/me', async (request, reply) => {
    const session = await auth.api.getSession({ headers: toWebHeaders(request) });
    if (!session) return reply.code(401).send({ message: 'Non authentifié' });
    return meResponseSchema.parse({
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.name || null,
    });
  });
}
