import { overviewSchema, searchResultSchema } from '@tableau-clair/contracts';
import { eq, schema } from '@tableau-clair/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from './harness';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.drop();
});

/** Ajoute un étage, une pièce et des équipements, et les relie à des disjoncteurs. */
async function addPlan(
  propertyId: string,
  fixtures: { label: string; breakerId?: string; status?: 'verified' | 'assumed' | 'unknown' }[],
  names: { floor?: string; room?: string } = {},
) {
  const [floor] = await h.db
    .insert(schema.floors)
    .values({ propertyId, name: names.floor ?? 'RDC', index: 10, width: 100, height: 100 })
    .returning();
  const [room] = await h.db
    .insert(schema.rooms)
    .values({ floorId: floor!.id, name: names.room ?? 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
    .returning();
  const created = [];
  for (const [index, f] of fixtures.entries()) {
    const [fixture] = await h.db
      .insert(schema.fixtures)
      .values({ roomId: room!.id, kind: 'socket', label: f.label, x: index, y: index })
      .returning();
    if (f.breakerId) {
      await h.db
        .insert(schema.circuits)
        .values({ fixtureId: fixture!.id, breakerId: f.breakerId, status: f.status ?? 'assumed' });
    }
    created.push(fixture!);
  }
  return { floor: floor!, room: room!, fixtures: created };
}

const breaker = (position: number, extra: Record<string, unknown> = {}) => ({
  position,
  width: 1,
  kind: 'breaker',
  label: `Départ ${position}`,
  ...extra,
});

describe('GET /api/properties/:id/overview', () => {
  it('décrit un logement vide', async () => {
    const { owner, property } = await h.scenario('Martial');
    const response = await h.call(owner, 'GET', `/api/properties/${property.id}/overview`);
    expect(response.status).toBe(200);
    const overview = overviewSchema.parse(response.body);
    expect(overview).toMatchObject({
      boardCount: 1,
      reliability: { total: 0, verified: 0, assumed: 0, unknown: 0 },
    });
    expect(overview.lastModified?.by).toBe('Martial');
  });

  it('calcule la fiabilité : un équipement sans disjoncteur est « inconnu »', async () => {
    const { owner, property, rows } = await h.scenario();
    const a = (await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(0))).body;
    const b = (await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(1))).body;
    await addPlan(property.id, [
      { label: 'Prise 1', breakerId: a.id, status: 'verified' },
      { label: 'Prise 2', breakerId: a.id, status: 'verified' },
      { label: 'Prise 3', breakerId: b.id, status: 'assumed' },
      { label: 'Prise 4' },
      { label: 'Prise 5' },
    ]);

    const { body } = await h.call(owner, 'GET', `/api/properties/${property.id}/overview`);
    expect(body.reliability).toEqual({ total: 5, verified: 2, assumed: 1, unknown: 2 });
  });

  it('remonte la dernière modification et son auteur', async () => {
    const { owner, property, rows } = await h.scenario('Martial');
    const other = await h.addMember(property.id, 'editor');
    await h.db
      .update(schema.users)
      .set({ displayName: 'Camille' })
      .where(eq(schema.users.id, other));

    await new Promise((r) => setTimeout(r, 15));
    await h.call(other, 'POST', `/api/rows/${rows[0]!.id}/elements`, breaker(2));

    const { body } = await h.call(owner, 'GET', `/api/properties/${property.id}/overview`);
    expect(body.lastModified.by).toBe('Camille');
  });

  it('exige une session et l’appartenance au logement', async () => {
    const { property } = await h.scenario();
    const stranger = await h.createUser();
    expect((await h.call(null, 'GET', `/api/properties/${property.id}/overview`)).status).toBe(401);
    expect((await h.call(stranger, 'GET', `/api/properties/${property.id}/overview`)).status).toBe(
      404,
    );
  });
});

describe('GET /api/properties/:id/search', () => {
  const search = (userId: string, propertyId: string, q: string) =>
    h.call(userId, 'GET', `/api/properties/${propertyId}/search?q=${encodeURIComponent(q)}`);

  it('trouve un appareil par libellé, marque ou référence, avec sa position', async () => {
    const { owner, property, rows } = await h.scenario();
    await h.call(owner, 'POST', `/api/rows/${rows[1]!.id}/elements`, {
      ...breaker(3),
      label: 'Cumulus',
      brand: 'Legrand',
      model: 'DX3 16A',
    });

    for (const q of ['cumul', 'legrand', 'DX3']) {
      const { status, body } = await search(owner, property.id, q);
      expect(status).toBe(200);
      const [hit] = body.map((r: unknown) => searchResultSchema.parse(r));
      expect(hit).toMatchObject({ kind: 'element', title: 'Cumulus' });
      expect(hit.subtitle).toContain('Tableau principal · Rangée 2 · module 4');
    }
  });

  it('ignore la casse et les accents', async () => {
    const { owner, property, rows } = await h.scenario();
    await h.call(
      owner,
      'POST',
      `/api/rows/${rows[0]!.id}/elements`,
      breaker(0, { label: 'Éclairage séjour' }),
    );

    for (const q of ['eclairage', 'ÉCLAIRAGE', 'sejour']) {
      const { body } = await search(owner, property.id, q);
      expect(
        body.map((r: { title: string }) => r.title),
        q,
      ).toContain('Éclairage séjour');
    }
  });

  it('trouve un tableau par son nom ou son emplacement', async () => {
    const { owner, property } = await h.scenario();
    await h.call(owner, 'POST', `/api/properties/${property.id}/boards`, {
      name: 'Extension',
      location: 'Garage',
      rowCount: 1,
      modulesPerRow: 12,
    });
    const byName = await search(owner, property.id, 'extension');
    expect(byName.body[0]).toMatchObject({ kind: 'board', title: 'Extension' });
    const byPlace = await search(owner, property.id, 'garage');
    expect(byPlace.body[0]).toMatchObject({ kind: 'board', subtitle: 'Garage' });
  });

  it('depuis une prise : indique le disjoncteur à couper et le statut', async () => {
    const { owner, property, board, rows } = await h.scenario();
    const dishwasher = (
      await h.call(
        owner,
        'POST',
        `/api/rows/${rows[0]!.id}/elements`,
        breaker(4, { label: 'Lave-vaisselle' }),
      )
    ).body;
    await addPlan(
      property.id,
      [
        { label: 'Prise du lave-vaisselle', breakerId: dishwasher.id, status: 'verified' },
        { label: 'Prise mystère' },
      ],
      { room: 'Cuisine', floor: 'RDC' },
    );

    const linked = (await search(owner, property.id, 'lave-vaisselle')).body.find(
      (r: { kind: string }) => r.kind === 'fixture',
    );
    expect(searchResultSchema.parse(linked)).toMatchObject({
      kind: 'fixture',
      subtitle: 'Cuisine · RDC',
      status: 'verified',
      breaker: {
        id: dishwasher.id,
        label: 'Lave-vaisselle',
        boardId: board.id,
        boardName: 'Tableau principal',
        rowIndex: 0,
        position: 4,
      },
    });

    const orphan = (await search(owner, property.id, 'mystère')).body[0];
    expect(orphan).toMatchObject({ kind: 'fixture', status: 'unknown', breaker: null });
  });

  it('depuis une pièce : renvoie la pièce et ses équipements', async () => {
    const { owner, property } = await h.scenario();
    await addPlan(property.id, [{ label: 'Prise A' }, { label: 'Prise B' }], {
      room: 'Salle de bain',
    });

    const { body } = await search(owner, property.id, 'salle de bain');
    expect(body.map((r: { kind: string }) => r.kind).sort()).toEqual([
      'fixture',
      'fixture',
      'room',
    ]);
  });

  it('reste cantonnée au logement demandé', async () => {
    const a = await h.scenario();
    const b = await h.scenario();
    await h.call(
      b.owner,
      'POST',
      `/api/rows/${b.rows[0]!.id}/elements`,
      breaker(0, { label: 'Secret voisin' }),
    );
    await addPlan(b.property.id, [{ label: 'Prise secrète' }], { room: 'Chambre secrète' });

    const mine = await search(a.owner, a.property.id, 'secret');
    expect(mine.body).toEqual([]);
    const theirs = await search(a.owner, b.property.id, 'secret');
    expect(theirs.status).toBe(404);
  });

  it('traite % et _ comme du texte, pas comme des jokers', async () => {
    const { owner, property, rows } = await h.scenario();
    await h.call(
      owner,
      'POST',
      `/api/rows/${rows[0]!.id}/elements`,
      breaker(0, { label: 'Remise à 100%' }),
    );
    await h.call(
      owner,
      'POST',
      `/api/rows/${rows[0]!.id}/elements`,
      breaker(1, { label: 'Autre appareil' }),
    );

    expect((await search(owner, property.id, '%%')).body).toEqual([]);
    expect((await search(owner, property.id, 'a_p')).body).toEqual([]);
    const literal = await search(owner, property.id, '100%');
    expect(literal.body.map((r: { title: string }) => r.title)).toEqual(['Remise à 100%']);
  });

  it('renvoie une liste vide pour une requête trop courte ou vide', async () => {
    const { owner, property } = await h.scenario();
    expect((await search(owner, property.id, 'a')).body).toEqual([]);
    expect((await search(owner, property.id, '   ')).body).toEqual([]);
    expect((await h.call(owner, 'GET', `/api/properties/${property.id}/search`)).body).toEqual([]);
  });

  it('plafonne le nombre de résultats', async () => {
    const { owner, property } = await h.scenario();
    await addPlan(
      property.id,
      Array.from({ length: 40 }, (_, i) => ({ label: `Prise ${i}` })),
    );
    const { body } = await search(owner, property.id, 'prise');
    expect(body).toHaveLength(30);
  });

  it('exige une session', async () => {
    const { property } = await h.scenario();
    expect(
      (await h.call(null, 'GET', `/api/properties/${property.id}/search?q=prise`)).status,
    ).toBe(401);
  });
});
