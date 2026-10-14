import { createCustomModelSchema, type CustomModel } from '@tableau-clair/contracts';
import { and, asc, customModels, eq, type Database } from '@tableau-clair/db';
import type { FastifyInstance } from 'fastify';
import { notFound, parseBody } from '../http';
import { parseId } from './access';

type Row = typeof customModels.$inferSelect;

const toCustomModel = (row: Row): CustomModel => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  updatedBy: row.updatedBy,
  version: row.version,
  label: row.label,
  role: row.role,
  brand: row.brand,
  model: row.model,
  width: row.width,
});

/**
 * Modèles d'appareils personnalisés : propres à l'utilisateur, réutilisables dans tous ses
 * logements. Un modèle d'un autre compte est indiscernable d'un modèle inexistant (404).
 */
export function registerCustomModelRoutes(app: FastifyInstance, db: Database) {
  app.get('/api/custom-models', async (request) => {
    const rows = await db
      .select()
      .from(customModels)
      .where(eq(customModels.userId, request.userId))
      .orderBy(asc(customModels.label));
    return rows.map(toCustomModel);
  });

  app.post('/api/custom-models', async (request, reply) => {
    const input = parseBody(createCustomModelSchema, request.body);
    const [created] = await db
      .insert(customModels)
      .values({
        userId: request.userId,
        label: input.label,
        role: input.role ?? null,
        brand: input.brand ?? null,
        model: input.model ?? null,
        width: input.width,
        updatedBy: request.userId,
      })
      .returning();
    return reply.code(201).send(toCustomModel(created!));
  });

  app.delete('/api/custom-models/:id', async (request, reply) => {
    const id = parseId((request.params as { id?: string }).id);
    const [removed] = await db
      .delete(customModels)
      .where(and(eq(customModels.id, id), eq(customModels.userId, request.userId)))
      .returning({ id: customModels.id });
    if (!removed) throw notFound('Modèle');
    return reply.code(204).send();
  });
}
