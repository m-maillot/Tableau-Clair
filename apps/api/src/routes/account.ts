import {
  accountSummarySchema,
  deleteAccountSchema,
  type AccountSummary,
} from '@tableau-clair/contracts';
import {
  and,
  asc,
  boards,
  aiAnalyses,
  customModels,
  eq,
  inArray,
  memberships,
  properties,
  schema,
  sql,
  type Database,
} from '@tableau-clair/db';
import type { FastifyInstance } from 'fastify';
import { notFound, parseBody, unprocessable } from '../http';
import type { ObjectStorage } from '../storage/object-storage';
import { loadBoard } from './board-loader';
import { loadPlan } from './plan';
import { propertyObjectKeys, toPhoto } from './photos';

async function currentUser(db: Database, userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw notFound('Compte');
  return user;
}

/** Logements supprimés (seule propriétaire) et quittés (tous les autres), pour un compte. */
async function summarize(
  db: Database,
  userId: string,
): Promise<Omit<AccountSummary, 'email' | 'displayName'>> {
  const mine = await db
    .select({ property: properties, role: memberships.role })
    .from(memberships)
    .innerJoin(properties, eq(properties.id, memberships.propertyId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(properties.name));
  const ids = mine.map((m) => m.property.id);
  if (ids.length === 0) return { deletedProperties: [], leftProperties: [] };

  const members = await db
    .select({
      propertyId: memberships.propertyId,
      userId: memberships.userId,
      role: memberships.role,
    })
    .from(memberships)
    .where(inArray(memberships.propertyId, ids));
  const boardCounts = await db
    .select({ propertyId: boards.propertyId, count: sql<number>`count(*)::int` })
    .from(boards)
    .where(inArray(boards.propertyId, ids))
    .groupBy(boards.propertyId);
  const counts = new Map(boardCounts.map((b) => [b.propertyId, b.count]));

  const deletedProperties: AccountSummary['deletedProperties'] = [];
  const leftProperties: AccountSummary['leftProperties'] = [];
  for (const { property, role } of mine) {
    const all = members.filter((m) => m.propertyId === property.id);
    const otherOwners = all.filter((m) => m.role === 'owner' && m.userId !== userId);
    if (role === 'owner' && otherOwners.length === 0) {
      deletedProperties.push({
        id: property.id,
        name: property.name,
        boardCount: counts.get(property.id) ?? 0,
        otherMembers: all.filter((m) => m.userId !== userId).length,
      });
    } else {
      leftProperties.push({ id: property.id, name: property.name });
    }
  }
  return { deletedProperties, leftProperties };
}

export function registerAccountRoutes(app: FastifyInstance, db: Database, storage: ObjectStorage) {
  // --- Résumé : ce que la suppression emporterait ---------------------------------------------------------
  app.get('/api/account', async (request): Promise<AccountSummary> => {
    const user = await currentUser(db, request.userId);
    return accountSummarySchema.parse({
      email: user.email,
      displayName: user.displayName,
      ...(await summarize(db, request.userId)),
    });
  });

  // --- Export complet : données et liens vers les photos -----------------------------------------------
  app.get('/api/account/export', async (request, reply) => {
    const user = await currentUser(db, request.userId);
    const mine = await db
      .select({ property: properties, role: memberships.role })
      .from(memberships)
      .innerJoin(properties, eq(properties.id, memberships.propertyId))
      .where(eq(memberships.userId, request.userId))
      .orderBy(asc(properties.name));

    const exported = [];
    for (const { property, role } of mine) {
      const boardRows = await db
        .select()
        .from(boards)
        .where(eq(boards.propertyId, property.id))
        .orderBy(asc(boards.name));
      const photoRows = await db
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.propertyId, property.id));
      exported.push({
        id: property.id,
        name: property.name,
        address: property.address,
        notes: property.notes,
        role,
        boards: await Promise.all(boardRows.map((b) => loadBoard(db, b))),
        plan: await loadPlan(db, property.id),
        // Les fichiers se récupèrent par `contentUrl` (accès contrôlé, session requise).
        photos: photoRows.map((p) => ({ ...toPhoto(p) })),
      });
    }
    const models = await db
      .select()
      .from(customModels)
      .where(eq(customModels.userId, request.userId));

    const analyses = await db
      .select()
      .from(aiAnalyses)
      .where(eq(aiAnalyses.userId, request.userId))
      .orderBy(asc(aiAnalyses.createdAt));

    const stamp = new Date().toISOString();
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="tableau-clair-export-${stamp.slice(0, 10)}.json"`,
      )
      .send(
        JSON.stringify(
          {
            exportedAt: stamp,
            account: {
              email: user.email,
              displayName: user.displayName,
              createdAt: user.createdAt.toISOString(),
            },
            customModels: models.map((m) => ({
              label: m.label,
              role: m.role,
              brand: m.brand,
              model: m.model,
              width: m.width,
            })),
            // Journal des analyses de photo (quota) : aucune image ni sortie du modèle.
            aiAnalyses: analyses.map((a) => ({
              createdAt: a.createdAt.toISOString(),
              status: a.status,
              model: a.model,
              inputTokens: a.inputTokens,
              outputTokens: a.outputTokens,
              elementCount: a.elementCount,
            })),
            properties: exported,
          },
          null,
          2,
        ),
      );
  });

  // --- Suppression du compte ------------------------------------------------------------------------------
  app.delete('/api/account', async (request, reply) => {
    const input = parseBody(deleteAccountSchema, request.body);
    const user = await currentUser(db, request.userId);
    if (input.confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw unprocessable('confirmation_mismatch', 'L’adresse saisie ne correspond pas au compte.');
    }

    const keys = await db.transaction(async (tx) => {
      const summary = await summarize(tx as unknown as Database, request.userId);
      const doomed = summary.deletedProperties.map((p) => p.id);
      const files: string[] = [];
      for (const id of doomed)
        files.push(...(await propertyObjectKeys(tx as unknown as Database, id)));
      if (doomed.length > 0) await tx.delete(properties).where(inArray(properties.id, doomed));
      // Les autres logements : l'appartenance disparaît avec le compte (cascade).
      await tx.delete(schema.verifications).where(eq(schema.verifications.identifier, user.email));
      await tx.delete(schema.users).where(and(eq(schema.users.id, user.id)));
      return files;
    });

    const failed = await storage.deleteMany(keys).catch(() => keys);
    if (failed.length > 0) request.log.error({ keys: failed }, 'Fichiers orphelins non supprimés');
    return reply.code(204).send();
  });
}
