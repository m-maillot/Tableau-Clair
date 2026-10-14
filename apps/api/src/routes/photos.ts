import { PHOTO_LIMITS, photoUsageSchema, type Photo } from '@tableau-clair/contracts';
import { and, eq, memberships, photos, schema, type Database } from '@tableau-clair/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { HttpError, notFound } from '../http';
import { ImageError, processImage } from '../storage/images';
import type { ObjectStorage } from '../storage/object-storage';
import { parseId, propertyAccess, requireRole } from './access';

/** Durée de vie d'une URL signée : assez pour charger la page, trop court pour être partagée. */
export const SIGNED_URL_TTL_SECONDS = 300;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoRow = typeof photos.$inferSelect;

export function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    version: row.version,
    propertyId: row.propertyId,
    usage: row.usage,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    contentUrl: `/api/photos/${row.id}/content`,
  };
}

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);

async function photoAccess(db: Database, userId: string, photoId: string) {
  const [row] = await db
    .select({ photo: photos, role: memberships.role })
    .from(photos)
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, photos.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!row) throw notFound('Photo');
  return row;
}

export function registerPhotoRoutes(app: FastifyInstance, db: Database, storage: ObjectStorage) {
  // Corps binaire brut : le type de contenu est celui de l'image.
  app.addContentTypeParser(
    ACCEPTED_TYPES,
    { parseAs: 'buffer', bodyLimit: PHOTO_LIMITS.maxUploadBytes },
    (_request, body, done) => done(null, body),
  );

  // --- Envoi ---------------------------------------------------------------------------------------------
  app.post(
    '/api/properties/:id/photos',
    { bodyLimit: PHOTO_LIMITS.maxUploadBytes },
    async (request, reply) => {
      const propertyId = idOf(request);
      const { role } = await propertyAccess(db, request.userId, propertyId);
      requireRole(role, 'editor');

      const usage = photoUsageSchema.safeParse((request.query as { usage?: string }).usage);
      if (!usage.success) {
        throw new HttpError(400, 'invalid_usage', 'Paramètre « usage » manquant ou inconnu', {
          allowed: photoUsageSchema.options,
        });
      }
      const contentType = (request.headers['content-type'] ?? '').split(';')[0]!.trim();
      if (!ACCEPTED_TYPES.includes(contentType)) {
        throw new HttpError(
          415,
          'unsupported_format',
          'Format non pris en charge (JPEG, PNG ou WebP)',
        );
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new HttpError(400, 'empty_body', 'Aucun fichier reçu');
      }

      let processed;
      try {
        processed = await processImage(request.body, usage.data);
      } catch (error) {
        if (error instanceof ImageError) {
          const status = error.code === 'unsupported_format' ? 415 : 422;
          throw new HttpError(status, error.code, error.message);
        }
        throw error;
      }

      const id = randomUUID();
      const objectKey = `properties/${propertyId}/${id}.webp`;
      await storage.put(objectKey, processed.data, processed.mimeType);

      try {
        const [row] = await db
          .insert(photos)
          .values({
            id,
            propertyId,
            objectKey,
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.data.length,
            usage: usage.data,
            updatedBy: request.userId,
          })
          .returning();
        return reply.code(201).send(toPhoto(row!));
      } catch (error) {
        // Pas de fichier orphelin si l'enregistrement échoue.
        await storage.delete(objectKey).catch((cleanup: unknown) => {
          request.log.error({ err: cleanup, objectKey }, 'Fichier orphelin non supprimé');
        });
        throw error;
      }
    },
  );

  // --- Métadonnées -----------------------------------------------------------------------------------------
  app.get('/api/photos/:id', async (request) => {
    const { photo } = await photoAccess(db, request.userId, idOf(request));
    return toPhoto(photo);
  });

  // --- Contenu : redirection vers une URL signée de courte durée ----------------------------------------
  app.get('/api/photos/:id/content', async (request, reply) => {
    const { photo } = await photoAccess(db, request.userId, idOf(request));
    const url = await storage.signedGetUrl(photo.objectKey, SIGNED_URL_TTL_SECONDS);
    return reply.header('cache-control', 'private, no-store').redirect(url, 302);
  });

  // --- Suppression ------------------------------------------------------------------------------------------------
  app.delete('/api/photos/:id', async (request, reply) => {
    const { photo, role } = await photoAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    // Les références (tableau, élément, équipement, étage) passent à NULL (clés étrangères).
    await db.delete(photos).where(eq(photos.id, photo.id));
    await storage.delete(photo.objectKey).catch((error: unknown) => {
      request.log.error(
        { err: error, objectKey: photo.objectKey },
        'Fichier orphelin non supprimé',
      );
    });
    return reply.code(204).send();
  });
}

/** Clés S3 de toutes les photos d'un logement (à lire avant sa suppression en base). */
export async function propertyObjectKeys(db: Database, propertyId: string): Promise<string[]> {
  const rows = await db
    .select({ key: schema.photos.objectKey })
    .from(schema.photos)
    .where(eq(schema.photos.propertyId, propertyId));
  return rows.map((r) => r.key);
}
