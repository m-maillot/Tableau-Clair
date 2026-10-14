import {
  createPropertySchema,
  updatePropertySchema,
  type Property,
} from '@tableau-clair/contracts';
import { and, asc, eq, memberships, properties, type Database } from '@tableau-clair/db';
import type { FastifyInstance } from 'fastify';
import { conflict, parseBody } from '../http';
import { parseId, propertyAccess, requireRole } from './access';
import type { ObjectStorage } from '../storage/object-storage';
import { propertyObjectKeys } from './photos';
import { toProperty } from './serialize';

export function registerPropertyRoutes(app: FastifyInstance, db: Database, storage: ObjectStorage) {
  app.get('/api/properties', async (request) => {
    const rows = await db
      .select({ property: properties, role: memberships.role })
      .from(memberships)
      .innerJoin(properties, eq(properties.id, memberships.propertyId))
      .where(eq(memberships.userId, request.userId))
      .orderBy(asc(properties.name));
    return rows.map((r) => toProperty(r.property, r.role));
  });

  app.post('/api/properties', async (request, reply) => {
    const input = parseBody(createPropertySchema, request.body);
    const created = await db.transaction(async (tx) => {
      const [property] = await tx
        .insert(properties)
        .values({
          name: input.name,
          address: input.address ?? null,
          notes: input.notes ?? null,
          updatedBy: request.userId,
        })
        .returning();
      // Le déclencheur « propriétaire minimum » est vérifié au commit.
      await tx
        .insert(memberships)
        .values({ propertyId: property!.id, userId: request.userId, role: 'owner' });
      return property!;
    });
    return reply.code(201).send(toProperty(created, 'owner'));
  });

  app.get('/api/properties/:id', async (request) => {
    const { property, role } = await propertyAccess(db, request.userId, idOf(request));
    return toProperty(property, role);
  });

  app.patch('/api/properties/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updatePropertySchema, request.body);
    const { role } = await propertyAccess(db, request.userId, id);
    requireRole(role, 'editor');

    const [updated] = await db
      .update(properties)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: request.userId,
      })
      .where(and(eq(properties.id, id), eq(properties.version, input.version)))
      .returning();
    if (!updated) {
      const { property } = await propertyAccess(db, request.userId, id);
      throw conflict(toProperty(property, role) satisfies Property);
    }
    return toProperty(updated, role);
  });

  app.delete('/api/properties/:id', async (request, reply) => {
    const id = idOf(request);
    const { role } = await propertyAccess(db, request.userId, id);
    requireRole(role, 'owner');
    // Les lignes de photos disparaissent en cascade : on relève les fichiers avant.
    const keys = await propertyObjectKeys(db, id);
    await db.delete(properties).where(eq(properties.id, id));
    const failed = await storage.deleteMany(keys).catch(() => keys);
    if (failed.length > 0) request.log.error({ keys: failed }, 'Fichiers orphelins non supprimés');
    return reply.code(204).send();
  });
}

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);
