import Fastify from 'fastify';
import { healthResponseSchema } from '@tableau-clair/contracts';

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => healthResponseSchema.parse({ status: 'ok' }));

  return app;
}
