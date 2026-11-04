import { PHOTO_LIMITS, type PhotoAnalysisResponse, type Quota } from '@tableau-clair/contracts';
import type { Database } from '@tableau-clair/db';
import { normalizeProposal } from '@tableau-clair/domain';
import { LIMITS } from '@tableau-clair/contracts';
import type { FastifyInstance } from 'fastify';
import { AnalysisError, type PhotoAnalyzer } from '../ai/analyzer';
import type { QuotaService } from '../ai/quota';
import { HttpError } from '../http';
import { ImageError, prepareForAnalysis } from '../storage/images';
import { boardAccess, parseId, requireRole } from './access';
import { loadRails } from './board-loader';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface AiOptions {
  quota: QuotaService;
  /** Absent sans clé d'API : la fonctionnalité est désactivée. */
  analyzer?: PhotoAnalyzer | undefined;
}

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);

/**
 * Analyse de photo de tableau (docs/SPEC-import-photo.md). Le corps binaire est lu par l'analyseur de
 * contenu enregistré par `registerPhotoRoutes` pour les mêmes types d'image.
 */
export function registerAiRoutes(app: FastifyInstance, db: Database, ai: AiOptions) {
  // --- Quota du jour ------------------------------------------------------------------------------------
  app.get('/api/ai/quota', async (request): Promise<Quota> => {
    if (!ai.analyzer) {
      return {
        enabled: false,
        limit: ai.quota.limit,
        used: 0,
        remaining: 0,
        resetsAt: new Date().toISOString(),
      };
    }
    return ai.quota.status(request.userId);
  });

  // --- Analyse ---------------------------------------------------------------------------------------------
  app.post(
    '/api/boards/:id/photo-analysis',
    { bodyLimit: PHOTO_LIMITS.maxUploadBytes },
    async (request): Promise<PhotoAnalysisResponse> => {
      const boardId = idOf(request);
      const { board, role } = await boardAccess(db, request.userId, boardId);
      requireRole(role, 'editor');

      const { analyzer } = ai;
      if (!analyzer) {
        throw new HttpError(
          503,
          'analysis_disabled',
          'L’analyse de photo n’est pas activée sur ce serveur',
        );
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

      // L'image est validée avant la réservation : une photo refusée ne consomme pas le quota.
      let image;
      try {
        image = await prepareForAnalysis(request.body);
      } catch (error) {
        if (error instanceof ImageError) {
          const status = error.code === 'unsupported_format' ? 415 : 422;
          throw new HttpError(status, error.code, error.message);
        }
        throw error;
      }

      const reservation = await ai.quota.reserve(request.userId, board.id, analyzer.model);
      try {
        const result = await analyzer.analyze({
          image: image.data,
          mimeType: image.mimeType,
          rowCount: board.rows,
          modulesPerRow: board.modulesPerRow,
        });

        const { rails, byRow } = await loadRails(db, board.id);
        const rows = normalizeProposal(
          result.rows,
          rails.map((rail) => ({
            index: rail.index,
            capacity: rail.capacity,
            elements: (byRow.get(rail.id) ?? []).map((e) => ({
              id: e.id,
              position: e.position,
              width: e.width,
            })),
          })),
          { maxLabelLength: LIMITS.maxNameLength },
        );

        const elementCount = rows.reduce((total, row) => total + row.elements.length, 0);
        await ai.quota.succeed(reservation.id, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          elementCount,
        });
        return {
          analysisId: reservation.id,
          rows,
          detectedGeometry: result.detectedGeometry,
          remarks: result.remarks,
          quota: reservation.quota,
        };
      } catch (error) {
        // Quelle que soit la cause, l'utilisateur n'est pas débité d'un échec.
        await ai.quota.fail(reservation.id).catch((cleanup: unknown) => {
          request.log.error({ err: cleanup }, 'Analyse non restituée au quota');
        });
        if (error instanceof AnalysisError) {
          request.log.error({ err: error }, 'Analyse de photo en échec');
          throw new HttpError(
            502,
            'analysis_failed',
            'L’analyse a échoué. Rien n’a été modifié et cette tentative n’est pas décomptée.',
            { ...(await ai.quota.status(request.userId)) },
          );
        }
        throw error;
      }
    },
  );
}
