import {
  bulkCreateElementsResponseSchema,
  photoAnalysisResponseSchema,
  type Board,
} from '@tableau-clair/contracts';
import { eq, schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import type { Role } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnalysisError, type AnalyzerOutput, type PhotoAnalyzer } from '../ai/analyzer';
import { createQuotaService } from '../ai/quota';
import { buildApp } from '../app';
import type { ObjectStorage } from '../storage/object-storage';

// L'analyse de photo n'utilise pas le stockage d'objets : un simple bouchon suffit.
const storage = {} as ObjectStorage;

let t: TestDatabase;
let db: Database;
let app: FastifyInstance;
let behaviour: () => Promise<AnalyzerOutput>;
let analyses = 0;

const element = (position: number, extra: Record<string, unknown> = {}) => ({
  position,
  width: 1,
  kind: 'breaker' as const,
  label: 'Prises',
  ratingA: 16,
  confidence: 'high' as const,
  ...extra,
});

const proposal = (rows = [{ index: 0, elements: [element(0), element(1)] }]): AnalyzerOutput => ({
  rows: rows as AnalyzerOutput['rows'],
  detectedGeometry: null,
  remarks: ['Photo un peu sombre'],
  inputTokens: 1000,
  outputTokens: 200,
});

const analyzer: PhotoAnalyzer = {
  model: 'fake-model',
  analyze: async () => {
    analyses += 1;
    return behaviour();
  },
};

function build(withAnalyzer: boolean) {
  return buildApp({
    api: {
      db,
      storage,
      ai: {
        quota: createQuotaService(db, { limit: 3 }),
        analyzer: withAnalyzer ? analyzer : undefined,
      },
      resolveUserId: async (request) => {
        const header = request.headers['x-user-id'];
        return typeof header === 'string' ? header : null;
      },
    },
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  app = build(true);
});
afterAll(() => t.drop());
beforeEach(() => {
  analyses = 0;
  behaviour = async () => proposal();
});

async function createUser() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${crypto.randomUUID()}@test.local` })
    .returning();
  return user!.id;
}

async function json(
  server: FastifyInstance,
  userId: string,
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
) {
  const response = await server.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    headers: { 'x-user-id': userId },
  });
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined,
  };
}

async function scenario() {
  const owner = await createUser();
  const property = (await json(app, owner, 'POST', '/api/properties', { name: 'Maison' })).body;
  const board: Board = (
    await json(app, owner, 'POST', `/api/properties/${property.id}/boards`, {
      name: 'Principal',
      rowCount: 2,
      modulesPerRow: 12,
    })
  ).body;
  return { owner, property, board };
}

async function member(propertyId: string, role: Role) {
  const userId = await createUser();
  await db.insert(schema.memberships).values({ propertyId, userId, role });
  return userId;
}

const photo = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#888888' } })
    .jpeg()
    .toBuffer();

async function analyse(
  userId: string,
  boardId: string,
  options: { body?: Buffer; type?: string; server?: FastifyInstance } = {},
) {
  const response = await (options.server ?? app).inject({
    method: 'POST',
    url: `/api/boards/${boardId}/photo-analysis`,
    headers: { 'x-user-id': userId, 'content-type': options.type ?? 'image/jpeg' },
    payload: options.body ?? (await photo()),
  });
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined,
  };
}

describe('GET /api/ai/quota', () => {
  it('annonce 3 analyses restantes à un nouvel utilisateur', async () => {
    const { owner } = await scenario();
    const { status, body } = await json(app, owner, 'GET', '/api/ai/quota');
    expect(status).toBe(200);
    expect(body).toMatchObject({ enabled: true, limit: 3, used: 0, remaining: 3 });
  });

  it('indique que la fonctionnalité est désactivée sans analyseur', async () => {
    const { owner } = await scenario();
    const disabled = build(false);
    const { body } = await json(disabled, owner, 'GET', '/api/ai/quota');
    expect(body.enabled).toBe(false);
    await disabled.close();
  });

  it('exige une session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ai/quota' });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/boards/:id/photo-analysis', () => {
  it('renvoie la proposition normalisée, sans rien écrire en base', async () => {
    const { owner, board } = await scenario();
    const { status, body } = await analyse(owner, board.id);

    expect(status).toBe(200);
    const parsed = photoAnalysisResponseSchema.parse(body);
    expect(parsed.rows[0]!.elements.map((e) => e.position)).toEqual([0, 1]);
    expect(parsed.remarks).toEqual(['Photo un peu sombre']);
    expect(parsed.quota).toMatchObject({ used: 1, remaining: 2 });
    const reloaded: Board = (await json(app, owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(reloaded.rows.map((r) => r.used)).toEqual([0, 0]);

    const [log] = await db
      .select()
      .from(schema.aiAnalyses)
      .where(eq(schema.aiAnalyses.id, parsed.analysisId));
    expect(log).toMatchObject({
      status: 'succeeded',
      model: 'fake-model',
      inputTokens: 1000,
      outputTokens: 200,
      elementCount: 2,
      boardId: board.id,
    });
  });

  it('signale les conflits avec le contenu existant du tableau', async () => {
    const { owner, board } = await scenario();
    await json(app, owner, 'POST', `/api/rows/${board.rows[0]!.id}/elements`, {
      position: 1,
      width: 1,
      kind: 'breaker',
      label: 'Existant',
    });
    const { body } = await analyse(owner, board.id);
    expect(body.rows[0].elements.map((e: { conflict: string | null }) => e.conflict)).toEqual([
      null,
      'overlap',
    ]);
  });

  it('complète un libellé absent', async () => {
    behaviour = async () =>
      proposal([{ index: 0, elements: [element(0, { label: undefined, ratingA: 32 })] }]);
    const { owner, board } = await scenario();
    const { body } = await analyse(owner, board.id);
    expect(body.rows[0].elements[0].label).toBe('Disjoncteur 32 A');
  });

  it('refuse la 4ᵉ analyse du jour sans appeler Anthropic', async () => {
    const { owner, board } = await scenario();
    for (let i = 0; i < 3; i++) expect((await analyse(owner, board.id)).status).toBe(200);
    const { status, body } = await analyse(owner, board.id);

    expect(status).toBe(429);
    expect(body.code).toBe('quota_exceeded');
    expect(body.details).toMatchObject({ remaining: 0 });
    expect(analyses).toBe(3);
  });

  it('restitue le quota sur échec technique et répond 502', async () => {
    behaviour = async () => {
      throw new AnalysisError('API indisponible');
    };
    const { owner, board } = await scenario();
    const { status, body } = await analyse(owner, board.id);

    expect(status).toBe(502);
    expect(body.code).toBe('analysis_failed');
    expect(body.details).toMatchObject({ used: 0, remaining: 3 });
    expect((await json(app, owner, 'GET', '/api/ai/quota')).body.remaining).toBe(3);
  });

  it('restitue aussi le quota sur une erreur inattendue', async () => {
    behaviour = async () => {
      throw new Error('bug');
    };
    const { owner, board } = await scenario();
    expect((await analyse(owner, board.id)).status).toBe(500);
    expect((await json(app, owner, 'GET', '/api/ai/quota')).body.remaining).toBe(3);
  });

  it('ne consomme rien pour une image invalide ou un format refusé', async () => {
    const { owner, board } = await scenario();
    expect((await analyse(owner, board.id, { body: Buffer.from('pas une image') })).status).toBe(
      422,
    );
    expect(
      (await analyse(owner, board.id, { type: 'image/gif', body: await photo() })).status,
    ).toBe(415);
    expect((await json(app, owner, 'GET', '/api/ai/quota')).body.used).toBe(0);
    expect(analyses).toBe(0);
  });

  it('refuse une analyse simultanée de la même personne', async () => {
    let release!: () => void;
    behaviour = () =>
      new Promise((resolve) => {
        release = () => resolve(proposal());
      });
    const { owner, board } = await scenario();

    const first = analyse(owner, board.id);
    await vi_waitFor(() => analyses === 1);
    const second = await analyse(owner, board.id);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('analysis_in_progress');

    release();
    expect((await first).status).toBe(200);
  });

  it('respecte les droits : lecteur 403, étranger 404, non connecté 401', async () => {
    const { owner, property, board } = await scenario();
    const viewer = await member(property.id, 'viewer');
    const stranger = await createUser();

    expect((await analyse(viewer, board.id)).status).toBe(403);
    expect((await analyse(stranger, board.id)).status).toBe(404);
    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.id}/photo-analysis`,
      headers: { 'content-type': 'image/jpeg' },
      payload: await photo(),
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await analyse(await member(property.id, 'editor'), board.id)).status).toBe(200);
    expect(owner).toBeTruthy();
  });

  it('répond 503 sans analyseur configuré', async () => {
    const { owner, board } = await scenario();
    const disabled = build(false);
    const { status, body } = await analyse(owner, board.id, { server: disabled });
    expect(status).toBe(503);
    expect(body.code).toBe('analysis_disabled');
    await disabled.close();
  });
});

describe('POST /api/boards/:id/elements/bulk', () => {
  const item = (rowIndex: number, position: number, extra: Record<string, unknown> = {}) => ({
    rowIndex,
    position,
    width: 1,
    kind: 'breaker',
    label: `Disjoncteur ${position}`,
    ratingA: 16,
    ...extra,
  });

  it('crée tous les éléments dans leurs rangées', async () => {
    const { owner, board } = await scenario();
    const { status, body } = await json(
      app,
      owner,
      'POST',
      `/api/boards/${board.id}/elements/bulk`,
      {
        elements: [item(0, 0), item(0, 1), item(1, 5)],
      },
    );

    expect(status).toBe(201);
    const { elements } = bulkCreateElementsResponseSchema.parse(body);
    expect(elements.map((e) => e.rowId)).toEqual([
      board.rows[0]!.id,
      board.rows[0]!.id,
      board.rows[1]!.id,
    ]);
    const reloaded: Board = (await json(app, owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(reloaded.rows.map((r) => r.used)).toEqual([2, 1]);
  });

  it('est tout ou rien et désigne l’élément fautif', async () => {
    const { owner, board } = await scenario();
    const { status, body } = await json(
      app,
      owner,
      'POST',
      `/api/boards/${board.id}/elements/bulk`,
      {
        elements: [item(0, 0), item(0, 11, { width: 2 })],
      },
    );

    expect(status).toBe(422);
    expect(body.code).toBe('out_of_bounds');
    expect(body.details).toMatchObject({ index: 1 });
    const reloaded: Board = (await json(app, owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(reloaded.rows.map((r) => r.used)).toEqual([0, 0]);
  });

  it('détecte un chevauchement entre éléments du même lot', async () => {
    const { owner, board } = await scenario();
    const { status, body } = await json(
      app,
      owner,
      'POST',
      `/api/boards/${board.id}/elements/bulk`,
      {
        elements: [item(0, 2, { width: 2 }), item(0, 3)],
      },
    );
    expect(status).toBe(422);
    expect(body).toMatchObject({ code: 'overlap', details: { index: 1 } });
  });

  it('refuse une rangée inexistante', async () => {
    const { owner, board } = await scenario();
    const { status, body } = await json(
      app,
      owner,
      'POST',
      `/api/boards/${board.id}/elements/bulk`,
      {
        elements: [item(5, 0)],
      },
    );
    expect(status).toBe(422);
    expect(body).toMatchObject({ code: 'row_not_found', details: { index: 0 } });
  });

  it('valide le corps : lot vide ou champ inconnu', async () => {
    const { owner, board } = await scenario();
    const url = `/api/boards/${board.id}/elements/bulk`;
    expect((await json(app, owner, 'POST', url, { elements: [] })).status).toBe(400);
    expect(
      (await json(app, owner, 'POST', url, { elements: [item(0, 0, { surprise: 1 })] })).status,
    ).toBe(400);
  });

  it('exige le rôle éditeur', async () => {
    const { property, board } = await scenario();
    const viewer = await member(property.id, 'viewer');
    const stranger = await createUser();
    const url = `/api/boards/${board.id}/elements/bulk`;
    expect((await json(app, viewer, 'POST', url, { elements: [item(0, 0)] })).status).toBe(403);
    expect((await json(app, stranger, 'POST', url, { elements: [item(0, 0)] })).status).toBe(404);
  });
});

/** Attend qu'une condition devienne vraie (l'analyse simultanée est lancée en arrière-plan). */
async function vi_waitFor(condition: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition jamais remplie');
}
