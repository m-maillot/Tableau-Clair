import {
  boardImpactSchema,
  boardSchema,
  boardSummarySchema,
  elementSchema,
  propertySchema,
  type Board,
} from '@tableau-clair/contracts';
import { eq, schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import type { Role } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createTestBucket, type TestBucket } from '../storage/testing';

let t: TestDatabase;
let db: Database;
let app: FastifyInstance;
let bucket: TestBucket;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  bucket = await createTestBucket();
  app = buildApp({
    api: {
      db,
      storage: bucket.storage,
      // Identité simulée : l'authentification réelle est couverte par auth.test.ts.
      resolveUserId: async (request) => {
        const header = request.headers['x-user-id'];
        return typeof header === 'string' ? header : null;
      },
    },
  });
});
afterAll(async () => {
  await bucket.drop();
  await t.drop();
});

// --- Aides ---------------------------------------------------------------------------------------------

async function createUser() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${crypto.randomUUID()}@test.local` })
    .returning();
  return user!.id;
}

async function call(
  userId: string | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  const response = await app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload: payload as object } : {}),
    headers: userId ? { 'x-user-id': userId } : {},
  });
  const body = response.body ? JSON.parse(response.body) : undefined;
  return { status: response.statusCode, body };
}

/** Logement possédé par un nouvel utilisateur, avec un tableau de 2 rangées × 24 modules. */
async function scenario() {
  const owner = await createUser();
  const property = (await call(owner, 'POST', '/api/properties', { name: 'Maison' })).body;
  const board: Board = (
    await call(owner, 'POST', `/api/properties/${property.id}/boards`, {
      name: 'Tableau principal',
      rowCount: 2,
      modulesPerRow: 24,
    })
  ).body;
  return { owner, property, board, rows: board.rows };
}

async function addMember(propertyId: string, role: Role) {
  const userId = await createUser();
  await db.insert(schema.memberships).values({ propertyId, userId, role });
  return userId;
}

const breaker = (position: number, extra: Record<string, unknown> = {}) => ({
  position,
  width: 1,
  kind: 'breaker',
  label: `Départ ${position}`,
  ratingA: 16,
  ...extra,
});

// --- Authentification et isolation ------------------------------------------------------------------

describe('accès', () => {
  it('exige une session', async () => {
    const response = await call(null, 'GET', '/api/properties');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthorized');
  });

  it("n'expose rien d'un logement dont on n'est pas membre (404, pas 403)", async () => {
    const { property, board, rows } = await scenario();
    const intruder = await createUser();
    const element = (await call((await scenario()).owner, 'GET', '/api/properties')).status; // contrôle de l'aide
    expect(element).toBe(200);

    for (const [method, url, payload] of [
      ['GET', `/api/properties/${property.id}`],
      ['PATCH', `/api/properties/${property.id}`, { name: 'x', version: 1 }],
      ['DELETE', `/api/properties/${property.id}`],
      ['GET', `/api/properties/${property.id}/boards`],
      [
        'POST',
        `/api/properties/${property.id}/boards`,
        { name: 'x', rowCount: 1, modulesPerRow: 4 },
      ],
      ['GET', `/api/boards/${board.id}`],
      ['PATCH', `/api/boards/${board.id}`, { name: 'x', version: 1 }],
      ['DELETE', `/api/boards/${board.id}`],
      ['POST', `/api/boards/${board.id}/duplicate`],
      ['PATCH', `/api/rows/${rows[0]!.id}`, { capacity: 10, version: 1 }],
      ['POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0)],
    ] as const) {
      const response = await call(intruder, method, url, payload);
      expect(response.status, `${method} ${url}`).toBe(404);
    }
  });

  it('ne liste que les logements de l’utilisateur', async () => {
    const a = await scenario();
    const b = await scenario();
    const list = (await call(a.owner, 'GET', '/api/properties')).body as { id: string }[];
    expect(list.map((p) => p.id)).toEqual([a.property.id]);
    expect(list.map((p) => p.id)).not.toContain(b.property.id);
  });

  it('applique les rôles : lecteur en lecture seule, éditeur sans suppression de logement', async () => {
    const { property, board, rows } = await scenario();
    const viewer = await addMember(property.id, 'viewer');
    const editor = await addMember(property.id, 'editor');

    expect((await call(viewer, 'GET', `/api/boards/${board.id}`)).status).toBe(200);
    expect(
      (await call(viewer, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).status,
    ).toBe(403);
    expect(
      (await call(viewer, 'PATCH', `/api/boards/${board.id}`, { name: 'x', version: 1 })).status,
    ).toBe(403);
    expect((await call(viewer, 'DELETE', `/api/boards/${board.id}`)).status).toBe(403);

    expect(
      (await call(editor, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).status,
    ).toBe(201);
    expect((await call(editor, 'DELETE', `/api/properties/${property.id}`)).status).toBe(403);
  });
});

// --- Logements ---------------------------------------------------------------------------------------------

describe('logements', () => {
  it('crée un logement dont l’utilisateur est propriétaire', async () => {
    const owner = await createUser();
    const response = await call(owner, 'POST', '/api/properties', {
      name: '  Maison  ',
      address: '1 rue',
    });
    expect(response.status).toBe(201);
    const property = propertySchema.parse(response.body);
    expect(property).toMatchObject({ name: 'Maison', address: '1 rue', role: 'owner', version: 1 });
    expect(property.updatedBy).toBe(owner);
  });

  it('valide le corps', async () => {
    const owner = await createUser();
    const response = await call(owner, 'POST', '/api/properties', { name: '' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_body');
  });

  it('modifie avec la bonne version et renvoie 409 avec la version courante sinon', async () => {
    const { owner, property } = await scenario();

    const ok = await call(owner, 'PATCH', `/api/properties/${property.id}`, {
      name: 'Renommée',
      version: 1,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Renommée', version: 2, updatedBy: owner });

    const stale = await call(owner, 'PATCH', `/api/properties/${property.id}`, {
      name: 'Périmée',
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');
    expect(stale.body.details).toMatchObject({ name: 'Renommée', version: 2 });
  });

  it('supprime un logement et tout ce qu’il contient', async () => {
    const { owner, property, board } = await scenario();
    expect((await call(owner, 'DELETE', `/api/properties/${property.id}`)).status).toBe(204);
    expect((await call(owner, 'GET', `/api/properties/${property.id}`)).status).toBe(404);
    expect((await call(owner, 'GET', `/api/boards/${board.id}`)).status).toBe(404);
  });

  it('traite un identifiant mal formé comme introuvable', async () => {
    const owner = await createUser();
    expect((await call(owner, 'GET', '/api/properties/pas-un-uuid')).status).toBe(404);
  });
});

// --- Tableaux -------------------------------------------------------------------------------------------------

describe('tableaux', () => {
  it('crée un tableau avec ses rangées', async () => {
    const { board } = await scenario();
    const parsed = boardSchema.parse(board);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.rows.map((r) => [r.index, r.capacity, r.used])).toEqual([
      [0, 24, 0],
      [1, 24, 0],
    ]);
  });

  it('refuse une géométrie hors limites', async () => {
    const { owner, property } = await scenario();
    for (const body of [
      { name: 'x', rowCount: 0, modulesPerRow: 24 },
      { name: 'x', rowCount: 99, modulesPerRow: 24 },
      { name: 'x', rowCount: 2, modulesPerRow: 0 },
    ]) {
      const r = await call(owner, 'POST', `/api/properties/${property.id}/boards`, body);
      expect(r.status).toBe(400);
    }
  });

  it('expose la dernière modification du tableau, éléments compris, avec son auteur', async () => {
    const { owner, board, rows } = await scenario();
    await db.update(schema.users).set({ displayName: 'Martial' }).where(eq(schema.users.id, owner));

    const before = (await call(owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(before.lastModified.by).toBe('Martial');

    await new Promise((r) => setTimeout(r, 15));
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0));
    const after = (await call(owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(new Date(after.lastModified.at).getTime()).toBeGreaterThan(
      new Date(before.lastModified.at).getTime(),
    );
  });

  it('liste les tableaux avec leur occupation', async () => {
    const { owner, property, rows } = await scenario();
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0));
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
      ...breaker(1),
      kind: 'rcd',
      width: 2,
    });

    const list = (await call(owner, 'GET', `/api/properties/${property.id}/boards`)).body;
    const [summary] = list.map((b: unknown) => boardSummarySchema.parse(b));
    expect(summary).toMatchObject({ usedModules: 3, totalModules: 48, rowCount: 2 });
  });

  it('modifie les champs simples avec contrôle de version', async () => {
    const { owner, board } = await scenario();
    const ok = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      name: 'Garage',
      location: 'Sous-sol',
      version: board.version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      name: 'Garage',
      location: 'Sous-sol',
      version: board.version + 1,
    });

    const stale = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      name: 'x',
      version: board.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.details.name).toBe('Garage');
  });

  it('ajoute et retire des rangées vides', async () => {
    const { owner, board } = await scenario();
    const more = await call(owner, 'PATCH', `/api/boards/${board.id}`, { rowCount: 4, version: 1 });
    expect(more.body.rows).toHaveLength(4);
    expect(more.body.rows.map((r: { index: number }) => r.index)).toEqual([0, 1, 2, 3]);

    const fewer = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      rowCount: 1,
      version: more.body.version,
    });
    expect(fewer.body.rows).toHaveLength(1);
    expect(fewer.body.rowCount).toBe(1);
  });

  it('refuse de retirer une rangée qui contient des éléments', async () => {
    const { owner, board, rows } = await scenario();
    await call(owner, 'POST', `/api/rows/${rows[1]!.id}/elements`, breaker(0));
    const refused = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      rowCount: 1,
      version: 1,
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: 'row_not_empty', details: { rowIndex: 1 } });

    const after = (await call(owner, 'GET', `/api/boards/${board.id}`)).body;
    expect(after.rows).toHaveLength(2); // rien n'a été modifié
  });

  it('refuse de réduire les modules sous le contenu, accepte de les augmenter', async () => {
    const { owner, board, rows } = await scenario();
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(10));

    const refused = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      modulesPerRow: 10,
      version: 1,
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      code: 'capacity_below_content',
      details: { rowIndex: 0, minimum: 11 },
    });

    const ok = await call(owner, 'PATCH', `/api/boards/${board.id}`, {
      modulesPerRow: 11,
      version: 1,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.rows.map((r: { capacity: number }) => r.capacity)).toEqual([11, 11]);
  });

  it('duplique la composition avec le rattachement aux différentiels', async () => {
    const { owner, board, rows } = await scenario();
    const rcd = (
      await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
        position: 0,
        width: 2,
        kind: 'rcd',
        label: 'Diff 40 A',
        ratingA: 40,
        sensitivityMa: 30,
        rcdType: 'A',
      })
    ).body;
    await call(
      owner,
      'POST',
      `/api/rows/${rows[0]!.id}/elements`,
      breaker(2, { protectedByRcdId: rcd.id }),
    );

    const copy = await call(owner, 'POST', `/api/boards/${board.id}/duplicate`);
    expect(copy.status).toBe(201);
    const parsed = boardSchema.parse(copy.body);
    expect(parsed.id).not.toBe(board.id);
    expect(parsed.name).toBe('Tableau principal (copie)');

    const [first] = parsed.rows;
    expect(first!.elements).toHaveLength(2);
    const copiedRcd = first!.elements.find((e) => e.kind === 'rcd')!;
    const copiedBreaker = first!.elements.find((e) => e.kind === 'breaker')!;
    expect(copiedRcd.id).not.toBe(rcd.id);
    expect(copiedBreaker.protectedByRcdId).toBe(copiedRcd.id); // pointe vers la copie, pas l'original

    const original = (await call(owner, 'GET', `/api/boards/${board.id}`)).body as Board;
    expect(original.rows[0]!.elements).toHaveLength(2);
  });

  it('nomme la copie comme demandé et refuse un nom vide', async () => {
    const { owner, board } = await scenario();
    const named = await call(owner, 'POST', `/api/boards/${board.id}/duplicate`, {
      name: 'Garage — sauvegarde',
    });
    expect(named.status).toBe(201);
    expect(named.body.name).toBe('Garage — sauvegarde');

    const blank = await call(owner, 'POST', `/api/boards/${board.id}/duplicate`, { name: '  ' });
    expect(blank.status).toBe(400);
  });

  it('ne copie pas les liaisons avec les équipements du plan', async () => {
    const { owner, property, board, rows } = await scenario();
    const breakerEl = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0)))
      .body;
    const [floor] = await db
      .insert(schema.floors)
      .values({ propertyId: property.id, name: 'RDC', index: 0, width: 100, height: 100 })
      .returning();
    const [room] = await db
      .insert(schema.rooms)
      .values({ floorId: floor!.id, name: 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
      .returning();
    const [fixture] = await db
      .insert(schema.fixtures)
      .values({ roomId: room!.id, kind: 'socket', label: 'Prise', x: 1, y: 1 })
      .returning();
    await db
      .insert(schema.circuits)
      .values({ fixtureId: fixture!.id, breakerId: breakerEl.id, status: 'verified' });

    const copy = await call(owner, 'POST', `/api/boards/${board.id}/duplicate`);
    expect(copy.status).toBe(201);

    const links = await db
      .select()
      .from(schema.circuits)
      .where(eq(schema.circuits.fixtureId, fixture!.id));
    expect(links).toHaveLength(1);
    expect(links[0]!.breakerId).toBe(breakerEl.id); // toujours relié à l'original, pas à la copie
  });

  it('décrit l’impact d’une suppression', async () => {
    const { owner, property, board, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;
    await call(owner, 'POST', `/api/rows/${rows[1]!.id}/elements`, breaker(0));

    const other: Board = (
      await call(owner, 'POST', `/api/properties/${property.id}/boards`, {
        name: 'Autre',
        rowCount: 1,
        modulesPerRow: 12,
      })
    ).body;
    const otherBreaker = (
      await call(owner, 'POST', `/api/rows/${other.rows[0]!.id}/elements`, breaker(0))
    ).body;

    const [floor] = await db
      .insert(schema.floors)
      .values({ propertyId: property.id, name: 'RDC', index: 0, width: 100, height: 100 })
      .returning();
    const [room] = await db
      .insert(schema.rooms)
      .values({ floorId: floor!.id, name: 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
      .returning();
    const made = await db
      .insert(schema.fixtures)
      .values(
        [1, 2, 3].map((n) => ({
          roomId: room!.id,
          kind: 'socket' as const,
          label: `P${n}`,
          x: n,
          y: n,
        })),
      )
      .returning();
    await db.insert(schema.circuits).values([
      { fixtureId: made[0]!.id, breakerId: a.id, status: 'verified' as const },
      { fixtureId: made[1]!.id, breakerId: otherBreaker.id, status: 'assumed' as const },
    ]);

    const impact = await call(owner, 'GET', `/api/boards/${board.id}/impact`);
    expect(impact.status).toBe(200);
    expect(boardImpactSchema.parse(impact.body)).toEqual({
      rowCount: 2,
      elementCount: 2,
      hasPhoto: false,
      fixtureCount: 3,
      fixturesToUnlink: 1,
    });
  });

  it('passe les liaisons à « inconnue » quand on supprime le tableau, sans supprimer les équipements', async () => {
    const { owner, property, board, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;
    const [floor] = await db
      .insert(schema.floors)
      .values({ propertyId: property.id, name: 'RDC', index: 0, width: 100, height: 100 })
      .returning();
    const [room] = await db
      .insert(schema.rooms)
      .values({ floorId: floor!.id, name: 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
      .returning();
    const [fixture] = await db
      .insert(schema.fixtures)
      .values({ roomId: room!.id, kind: 'socket', label: 'Prise', x: 1, y: 1 })
      .returning();
    await db
      .insert(schema.circuits)
      .values({ fixtureId: fixture!.id, breakerId: a.id, status: 'verified' });

    expect((await call(owner, 'DELETE', `/api/boards/${board.id}`)).status).toBe(204);

    const [circuit] = await db
      .select()
      .from(schema.circuits)
      .where(eq(schema.circuits.fixtureId, fixture!.id));
    expect(circuit).toMatchObject({ breakerId: null, status: 'unknown' });
    expect(
      await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, fixture!.id)),
    ).toHaveLength(1);
  });

  it('supprime un tableau', async () => {
    const { owner, board } = await scenario();
    expect((await call(owner, 'DELETE', `/api/boards/${board.id}`)).status).toBe(204);
    expect((await call(owner, 'GET', `/api/boards/${board.id}`)).status).toBe(404);
  });
});

// --- Éléments -----------------------------------------------------------------------------------------------------

describe('éléments', () => {
  it('crée un élément et le renvoie conforme au contrat', async () => {
    const { owner, rows } = await scenario();
    const response = await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
      ...breaker(3),
      cableSection: 2.5,
      outgoingCables: 2,
      curve: 'C',
      poles: 2,
      brand: 'Legrand',
    });
    expect(response.status).toBe(201);
    const element = elementSchema.parse(response.body);
    expect(element).toMatchObject({
      position: 3,
      cableSection: 2.5,
      curve: 'C',
      brand: 'Legrand',
      updatedBy: owner,
      version: 1,
    });
  });

  it('refuse un chevauchement et nomme le conflit', async () => {
    const { owner, rows } = await scenario();
    const first = (
      await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, { ...breaker(4), width: 2 })
    ).body;
    const clash = await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(5));
    expect(clash.status).toBe(422);
    expect(clash.body).toMatchObject({
      code: 'overlap',
      details: { code: 'overlap', with: first.id },
    });
  });

  it('refuse un dépassement de la rangée', async () => {
    const { owner, rows } = await scenario();
    const response = await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
      ...breaker(23),
      width: 2,
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'out_of_bounds', details: { capacity: 24 } });
  });

  it('valide la forme : largeur nulle, champs inconnus, type inconnu', async () => {
    const { owner, rows } = await scenario();
    const url = `/api/rows/${rows[0]!.id}/elements`;
    expect((await call(owner, 'POST', url, { ...breaker(0), width: 0 })).status).toBe(400);
    expect(
      (await call(owner, 'POST', url, { ...breaker(0), rowId: crypto.randomUUID() })).status,
    ).toBe(400);
    expect((await call(owner, 'POST', url, { ...breaker(0), kind: 'grille-pain' })).status).toBe(
      400,
    );
  });

  it('déplace et redimensionne dans la rangée', async () => {
    const { owner, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(4));

    const moved = await call(owner, 'PATCH', `/api/elements/${a.id}`, { position: 2, version: 1 });
    expect(moved.body).toMatchObject({ position: 2, version: 2 });

    const resized = await call(owner, 'PATCH', `/api/elements/${a.id}`, { width: 2, version: 2 });
    expect(resized.body).toMatchObject({ width: 2, version: 3 });

    const blocked = await call(owner, 'PATCH', `/api/elements/${a.id}`, { width: 3, version: 3 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('overlap');
  });

  it('déplace vers une autre rangée du même tableau, pas vers un autre tableau', async () => {
    const { owner, property, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;

    const moved = await call(owner, 'PATCH', `/api/elements/${a.id}`, {
      rowId: rows[1]!.id,
      position: 5,
      version: 1,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ rowId: rows[1]!.id, position: 5 });

    const other: Board = (
      await call(owner, 'POST', `/api/properties/${property.id}/boards`, {
        name: 'Autre',
        rowCount: 1,
        modulesPerRow: 12,
      })
    ).body;
    const refused = await call(owner, 'PATCH', `/api/elements/${a.id}`, {
      rowId: other.rows[0]!.id,
      version: 2,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('row_other_board');
  });

  it('respecte la capacité de la rangée de destination', async () => {
    const { owner, rows } = await scenario();
    await call(owner, 'PATCH', `/api/rows/${rows[1]!.id}`, { capacity: 4, version: 1 });
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(10))).body;

    const refused = await call(owner, 'PATCH', `/api/elements/${a.id}`, {
      rowId: rows[1]!.id,
      version: 1,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('out_of_bounds');
  });

  it('détecte un conflit de version sur un élément', async () => {
    const { owner, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;
    await call(owner, 'PATCH', `/api/elements/${a.id}`, { label: 'Cumulus', version: 1 });

    const stale = await call(owner, 'PATCH', `/api/elements/${a.id}`, {
      label: 'Périmé',
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.details).toMatchObject({ label: 'Cumulus', version: 2 });
  });

  it('efface une valeur facultative avec null', async () => {
    const { owner, rows } = await scenario();
    const a = (
      await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0, { brand: 'X' }))
    ).body;
    const cleared = await call(owner, 'PATCH', `/api/elements/${a.id}`, {
      brand: null,
      version: 1,
    });
    expect(cleared.body.brand).toBeNull();
  });

  it('refuse une photo d’un autre logement et un différentiel qui n’en est pas un', async () => {
    const { owner, rows } = await scenario();
    const other = await scenario();
    const [foreign] = await db
      .insert(schema.photos)
      .values({
        propertyId: other.property.id,
        objectKey: `k/${crypto.randomUUID()}`,
        mimeType: 'image/jpeg',
        width: 10,
        height: 10,
        sizeBytes: 10,
        usage: 'element',
      })
      .returning();
    const url = `/api/rows/${rows[0]!.id}/elements`;

    const photo = await call(owner, 'POST', url, breaker(0, { photoId: foreign!.id }));
    expect(photo.status).toBe(422);
    expect(photo.body.code).toBe('photo_not_found');

    const notRcd = (await call(owner, 'POST', url, breaker(1))).body;
    const rcd = await call(owner, 'POST', url, breaker(2, { protectedByRcdId: notRcd.id }));
    expect(rcd.status).toBe(422);
    expect(rcd.body.code).toBe('rcd_not_found');
  });

  it('passe les liaisons à « inconnu » quand le disjoncteur est supprimé', async () => {
    const { owner, property, rows } = await scenario();
    const a = (await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;

    const [floor] = await db
      .insert(schema.floors)
      .values({ propertyId: property.id, name: 'RDC', index: 0, width: 100, height: 100 })
      .returning();
    const [room] = await db
      .insert(schema.rooms)
      .values({ floorId: floor!.id, name: 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
      .returning();
    const [fixture] = await db
      .insert(schema.fixtures)
      .values({ roomId: room!.id, kind: 'socket', label: 'Prise', x: 1, y: 1 })
      .returning();
    await db
      .insert(schema.circuits)
      .values({ fixtureId: fixture!.id, breakerId: a.id, status: 'verified' });

    expect((await call(owner, 'DELETE', `/api/elements/${a.id}`)).status).toBe(204);

    const [circuit] = await db
      .select()
      .from(schema.circuits)
      .where(eq(schema.circuits.fixtureId, fixture!.id));
    expect(circuit).toMatchObject({ breakerId: null, status: 'unknown' });
    expect(
      await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, fixture!.id)),
    ).toHaveLength(1);
  });

  it('sérialise les écritures concurrentes sur une même rangée', async () => {
    const { owner, rows } = await scenario();
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(7)),
      ),
    );
    const statuses = attempts.map((a) => a.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 422)).toHaveLength(5);
  });
});

// --- Rangées -----------------------------------------------------------------------------------------------------

describe('rangées', () => {
  it('modifie la capacité et refuse de passer sous le contenu', async () => {
    const { owner, rows } = await scenario();
    await call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(8));

    const refused = await call(owner, 'PATCH', `/api/rows/${rows[0]!.id}`, {
      capacity: 8,
      version: 1,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('out_of_bounds');

    const ok = await call(owner, 'PATCH', `/api/rows/${rows[0]!.id}`, { capacity: 9, version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ capacity: 9, used: 1 });
  });
});
