import type { Database } from '@tableau-clair/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, unauthorized } from '../http';
import { registerBoardRoutes } from './boards';
import { registerElementRoutes } from './elements';
import { registerPropertyRoutes } from './properties';

declare module 'fastify' {
  interface FastifyRequest {
    /** Identifiant de l'utilisateur authentifié (routes métier uniquement). */
    userId: string;
  }
}

export interface ApiRoutesOptions {
  db: Database;
  /** Résout l'utilisateur d'une requête (session), ou `null` s'il n'est pas connecté. */
  resolveUserId: (request: FastifyRequest) => Promise<string | null>;
}

/** Routes métier : toutes exigent une session, toutes passent par le contrôle d'appartenance. */
export function registerApiRoutes(app: FastifyInstance, options: ApiRoutesOptions) {
  app.register(async (api) => {
    api.decorateRequest('userId', '');

    api.setErrorHandler((error, request, reply) => {
      if (error instanceof HttpError) return reply.code(error.status).send(error.toBody());
      // Erreurs de format Fastify (JSON invalide, etc.).
      const status = (error as { statusCode?: number }).statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return reply.code(status).send({ code: 'bad_request', message: 'Requête invalide' });
      }
      request.log.error({ err: error }, 'Erreur inattendue');
      return reply.code(500).send({ code: 'internal_error', message: 'Erreur interne' });
    });

    api.addHook('onRequest', async (request) => {
      const userId = await options.resolveUserId(request);
      if (!userId) throw unauthorized();
      request.userId = userId;
    });

    registerPropertyRoutes(api, options.db);
    registerBoardRoutes(api, options.db);
    registerElementRoutes(api, options.db);
  });
}
