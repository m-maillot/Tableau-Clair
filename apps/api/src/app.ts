import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { healthResponseSchema } from '@tableau-clair/contracts';

export interface AppOptions {
  /** Dossier du build du front à servir (production, un seul service applicatif). */
  webDist?: string | undefined;
  /** Vérifie la connexion à la base ; doit rejeter si elle est indisponible. */
  checkDatabase?: (() => Promise<unknown>) | undefined;
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.register(
    async (api) => {
      api.get('/health', async (request, reply) => {
        try {
          await options.checkDatabase?.();
        } catch (error) {
          request.log.error({ err: error }, 'Base de données indisponible');
          return reply.code(503).send(healthResponseSchema.parse({ status: 'error' }));
        }
        return healthResponseSchema.parse({ status: 'ok' });
      });
    },
    { prefix: '/api' },
  );

  const { webDist } = options;
  if (webDist && existsSync(join(webDist, 'index.html'))) {
    app.register(fastifyStatic, { root: webDist, wildcard: false });
    // Repli SPA : toute route inconnue hors /api renvoie l'application.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ message: 'Not found' });
    });
  }

  return app;
}
