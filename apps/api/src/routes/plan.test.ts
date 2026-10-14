import { planSchema, type Floor, type Room } from '@tableau-clair/contracts';
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

const url = (propertyId: string, tail = '') => `/api/properties/${propertyId}${tail}`;

async function setup() {
  const s = await h.scenario();
  const floor = (await h.call(s.owner, 'POST', url(s.property.id, '/floors'), { name: 'RDC' }))
    .body as Floor;
  return { ...s, floor };
}

async function withRoom(name = 'Cuisine', rect = { x: 100, y: 100, w: 300, h: 200 }) {
  const s = await setup();
  const room = (await h.call(s.owner, 'POST', `/api/floors/${s.floor.id}/rooms`, { name, ...rect }))
    .body as Room;
  return { ...s, room };
}

const fixtureBody = (extra: Record<string, unknown> = {}) => ({
  kind: 'socket',
  label: 'Prise',
  x: 150,
  y: 150,
  ...extra,
});

describe('étages', () => {
  it('crée des étages numérotés à la suite, avec un canevas par défaut', async () => {
    const { owner, property } = await h.scenario();
    const a = (await h.call(owner, 'POST', url(property.id, '/floors'), { name: 'RDC' })).body;
    const b = (await h.call(owner, 'POST', url(property.id, '/floors'), { name: 'Étage' })).body;
    expect(a).toMatchObject({
      name: 'RDC',
      index: 0,
      width: 1000,
      height: 700,
      backgroundLocked: false,
    });
    expect(b.index).toBe(1);
  });

  it('renomme avec contrôle de version', async () => {
    const { owner, floor } = await setup();
    const ok = await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      name: 'Rez-de-chaussée',
      version: 1,
    });
    expect(ok.body).toMatchObject({ name: 'Rez-de-chaussée', version: 2 });

    const stale = await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      name: 'X',
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.details.name).toBe('Rez-de-chaussée');
  });

  it('réordonne les onglets et refuse une liste incohérente', async () => {
    const { owner, property, floor } = await setup();
    const second = (await h.call(owner, 'POST', url(property.id, '/floors'), { name: 'Étage' }))
      .body;
    const third = (await h.call(owner, 'POST', url(property.id, '/floors'), { name: 'Combles' }))
      .body;

    const reordered = await h.call(owner, 'PUT', url(property.id, '/floors/order'), {
      ids: [third.id, floor.id, second.id],
    });
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((f: Floor) => [f.name, f.index])).toEqual([
      ['Combles', 0],
      ['RDC', 1],
      ['Étage', 2],
    ]);

    for (const ids of [
      [floor.id],
      [floor.id, second.id, second.id],
      [floor.id, second.id, crypto.randomUUID()],
    ]) {
      const bad = await h.call(owner, 'PUT', url(property.id, '/floors/order'), { ids });
      expect(bad.status).toBe(422);
    }
  });

  it('refuse de réduire le plan sous une pièce', async () => {
    const { owner, floor } = await withRoom('Salon', { x: 500, y: 100, w: 300, h: 200 });
    const refused = await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      width: 600,
      version: 1,
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: 'rooms_outside' });
  });

  it('règle l’image de fond et supprime l’ancienne quand elle est remplacée', async () => {
    const { owner, property, floor } = await setup();
    const photo = async () => {
      const [row] = await h.db
        .insert(schema.photos)
        .values({
          propertyId: property.id,
          objectKey: `properties/${property.id}/${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          width: 2000,
          height: 1400,
          sizeBytes: 10,
          usage: 'floor_background',
        })
        .returning();
      return row!;
    };
    const first = await photo();
    const second = await photo();

    const set = await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      backgroundImageId: first.id,
      backgroundOpacity: 0.4,
      backgroundScale: 0.5,
      backgroundX: 20,
      backgroundY: 30,
      backgroundLocked: true,
      version: 1,
    });
    expect(set.body).toMatchObject({
      backgroundImageId: first.id,
      backgroundOpacity: 0.4,
      backgroundScale: 0.5,
      backgroundLocked: true,
    });

    const plan = planSchema.parse((await h.call(owner, 'GET', url(property.id, '/plan'))).body);
    expect(plan.floors[0]!.background).toEqual({ width: 2000, height: 1400 });

    await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      backgroundImageId: second.id,
      version: 2,
    });
    expect(
      await h.db.select().from(schema.photos).where(eq(schema.photos.id, first.id)),
    ).toHaveLength(0);
    expect(
      await h.db.select().from(schema.photos).where(eq(schema.photos.id, second.id)),
    ).toHaveLength(1);

    await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      backgroundImageId: null,
      version: 3,
    });
    expect(
      await h.db.select().from(schema.photos).where(eq(schema.photos.id, second.id)),
    ).toHaveLength(0);
  });

  it('refuse une image d’un autre logement et des valeurs hors bornes', async () => {
    const { owner, floor } = await setup();
    const other = await h.scenario();
    const [foreign] = await h.db
      .insert(schema.photos)
      .values({
        propertyId: other.property.id,
        objectKey: `k/${crypto.randomUUID()}`,
        mimeType: 'image/webp',
        width: 10,
        height: 10,
        sizeBytes: 10,
        usage: 'floor_background',
      })
      .returning();
    const refused = await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, {
      backgroundImageId: foreign!.id,
      version: 1,
    });
    expect(refused.status).toBe(422);

    for (const body of [{ backgroundOpacity: 2 }, { backgroundScale: 0 }, { width: 10 }]) {
      expect(
        (await h.call(owner, 'PATCH', `/api/floors/${floor.id}`, { ...body, version: 1 })).status,
      ).toBe(400);
    }
  });

  it('supprime l’étage avec ses pièces et équipements', async () => {
    const { owner, floor, room } = await withRoom();
    await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody());
    expect((await h.call(owner, 'DELETE', `/api/floors/${floor.id}`)).status).toBe(204);
    expect(await h.db.select().from(schema.rooms).where(eq(schema.rooms.id, room.id))).toHaveLength(
      0,
    );
  });
});

describe('pièces', () => {
  it('crée une pièce dans les limites du plan', async () => {
    const { room } = await withRoom('Cuisine');
    expect(room).toMatchObject({ name: 'Cuisine', x: 100, y: 100, w: 300, h: 200, version: 1 });
  });

  it('refuse une pièce hors du plan ou trop petite', async () => {
    const { owner, floor } = await setup();
    const out = await h.call(owner, 'POST', `/api/floors/${floor.id}/rooms`, {
      name: 'X',
      x: 900,
      y: 0,
      w: 300,
      h: 100,
    });
    expect(out).toMatchObject({ status: 422, body: { code: 'out_of_bounds' } });
    const tiny = await h.call(owner, 'POST', `/api/floors/${floor.id}/rooms`, {
      name: 'X',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
    expect(tiny).toMatchObject({ status: 422, body: { code: 'too_small' } });
  });

  it('renomme et redimensionne avec contrôle de version', async () => {
    const { owner, room } = await withRoom();
    const ok = await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, {
      name: 'Cuisine ouverte',
      w: 400,
      version: 1,
    });
    expect(ok.body).toMatchObject({ name: 'Cuisine ouverte', w: 400, version: 2 });
    const stale = await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, {
      name: 'Autre',
      version: 1,
    });
    expect(stale.status).toBe(409);
  });

  it('déplace les équipements avec leur pièce', async () => {
    const { owner, room } = await withRoom();
    const fixture = (
      await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody({ x: 150, y: 120 }))
    ).body;

    await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, { x: 300, y: 250, version: 1 });
    const [moved] = await h.db
      .select()
      .from(schema.fixtures)
      .where(eq(schema.fixtures.id, fixture.id));
    expect(moved).toMatchObject({ x: 350, y: 270 });
  });

  it('ramène dans la pièce les équipements qu’un redimensionnement laisserait dehors', async () => {
    const { owner, room } = await withRoom();
    const fixture = (
      await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody({ x: 380, y: 280 }))
    ).body;

    await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, { w: 100, h: 100, version: 1 });
    const [clamped] = await h.db
      .select()
      .from(schema.fixtures)
      .where(eq(schema.fixtures.id, fixture.id));
    expect(clamped).toMatchObject({ x: 200, y: 200 });
  });

  it('refuse un redimensionnement qui sort du plan', async () => {
    const { owner, room } = await withRoom();
    const refused = await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, { w: 5000, version: 1 });
    expect(refused).toMatchObject({ status: 422, body: { code: 'out_of_bounds' } });
    const out = await h.call(owner, 'PATCH', `/api/rooms/${room.id}`, { x: 800, version: 1 });
    expect(out).toMatchObject({ status: 422, body: { code: 'out_of_bounds' } });
  });

  it('supprime la pièce, ses équipements et leurs liaisons', async () => {
    const { owner, room, rows } = await withRoom();
    const breaker = (
      await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
        position: 0,
        width: 1,
        kind: 'breaker',
        label: 'D1',
      })
    ).body;
    const fixture = (await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody()))
      .body;
    await h.db
      .insert(schema.circuits)
      .values({ fixtureId: fixture.id, breakerId: breaker.id, status: 'assumed' });

    expect((await h.call(owner, 'DELETE', `/api/rooms/${room.id}`)).status).toBe(204);
    expect(
      await h.db.select().from(schema.fixtures).where(eq(schema.fixtures.id, fixture.id)),
    ).toHaveLength(0);
    expect(
      await h.db.select().from(schema.circuits).where(eq(schema.circuits.fixtureId, fixture.id)),
    ).toHaveLength(0);
  });
});

describe('équipements du plan', () => {
  it('place un équipement dans une pièce', async () => {
    const { owner, room } = await withRoom();
    const created = await h.call(
      owner,
      'POST',
      `/api/rooms/${room.id}/fixtures`,
      fixtureBody({ label: 'Prise plan de travail' }),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      roomId: room.id,
      kind: 'socket',
      label: 'Prise plan de travail',
      link: null,
    });
  });

  it('refuse un équipement hors de la pièce', async () => {
    const { owner, room } = await withRoom();
    const refused = await h.call(
      owner,
      'POST',
      `/api/rooms/${room.id}/fixtures`,
      fixtureBody({ x: 900, y: 900 }),
    );
    expect(refused).toMatchObject({ status: 422, body: { code: 'outside_room' } });
  });

  it('déplace, change de type et renomme', async () => {
    const { owner, room } = await withRoom();
    const fixture = (await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody()))
      .body;

    const moved = await h.call(owner, 'PATCH', `/api/fixtures/${fixture.id}`, {
      x: 200,
      y: 220,
      kind: 'light',
      label: 'Plafonnier',
      version: 1,
    });
    expect(moved.body).toMatchObject({
      x: 200,
      y: 220,
      kind: 'light',
      label: 'Plafonnier',
      version: 2,
    });

    const stale = await h.call(owner, 'PATCH', `/api/fixtures/${fixture.id}`, {
      label: 'X',
      version: 1,
    });
    expect(stale.status).toBe(409);
  });

  it('change de pièce du même logement, pas d’un autre logement', async () => {
    const { owner, floor, room } = await withRoom();
    const second = (
      await h.call(owner, 'POST', `/api/floors/${floor.id}/rooms`, {
        name: 'Salon',
        x: 500,
        y: 100,
        w: 300,
        h: 200,
      })
    ).body as Room;
    const fixture = (await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody()))
      .body;

    const ok = await h.call(owner, 'PATCH', `/api/fixtures/${fixture.id}`, {
      roomId: second.id,
      x: 600,
      y: 150,
      version: 1,
    });
    expect(ok.body).toMatchObject({ roomId: second.id, x: 600 });

    const foreign = await withRoom('Chambre');
    const refused = await h.call(owner, 'PATCH', `/api/fixtures/${fixture.id}`, {
      roomId: foreign.room.id,
      x: 150,
      y: 150,
      version: 2,
    });
    expect(refused).toMatchObject({ status: 422, body: { code: 'room_not_found' } });
  });

  it('supprime un équipement', async () => {
    const { owner, room } = await withRoom();
    const fixture = (await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody()))
      .body;
    expect((await h.call(owner, 'DELETE', `/api/fixtures/${fixture.id}`)).status).toBe(204);
    expect((await h.call(owner, 'DELETE', `/api/fixtures/${fixture.id}`)).status).toBe(404);
  });
});

describe('plan complet', () => {
  it('assemble étages, pièces, équipements avec leur liaison et disjoncteurs', async () => {
    const { owner, property, room, rows } = await withRoom('Cuisine');
    const breaker = (
      await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
        position: 2,
        width: 1,
        kind: 'breaker',
        label: 'Prises cuisine',
        ratingA: 16,
      })
    ).body;
    await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
      position: 0,
      width: 2,
      kind: 'rcd',
      label: 'Diff',
    });
    const linked = (
      await h.call(
        owner,
        'POST',
        `/api/rooms/${room.id}/fixtures`,
        fixtureBody({ label: 'Prise A' }),
      )
    ).body;
    await h.call(
      owner,
      'POST',
      `/api/rooms/${room.id}/fixtures`,
      fixtureBody({ label: 'Prise B', x: 200 }),
    );
    await h.db
      .insert(schema.circuits)
      .values({ fixtureId: linked.id, breakerId: breaker.id, status: 'verified' });

    const { status, body } = await h.call(owner, 'GET', url(property.id, '/plan'));
    expect(status).toBe(200);
    const plan = planSchema.parse(body);

    const floor = plan.floors[0]!;
    expect(floor.rooms.map((r) => r.name)).toEqual(['Cuisine']);
    const byLabel = Object.fromEntries(floor.fixtures.map((f) => [f.label, f.link]));
    expect(byLabel['Prise A']).toEqual({ breakerId: breaker.id, status: 'verified' });
    expect(byLabel['Prise B']).toBeNull();

    // Seuls les disjoncteurs divisionnaires sont listés, avec leur position et leurs liaisons.
    expect(plan.breakers).toEqual([
      expect.objectContaining({
        id: breaker.id,
        label: 'Prises cuisine',
        ratingA: 16,
        boardName: 'Tableau principal',
        rowIndex: 0,
        position: 2,
        linkedCount: 1,
      }),
    ]);
  });

  it('est vide pour un logement sans plan', async () => {
    const { owner, property } = await h.scenario();
    const { body } = await h.call(owner, 'GET', url(property.id, '/plan'));
    expect(body.floors).toEqual([]);
  });
});

describe('accès', () => {
  it('exige une session et l’appartenance au logement', async () => {
    const { property, floor, room } = await withRoom();
    const stranger = await h.createUser();
    for (const [method, path, payload] of [
      ['GET', url(property.id, '/plan')],
      ['POST', url(property.id, '/floors'), { name: 'X' }],
      ['PATCH', `/api/floors/${floor.id}`, { name: 'X', version: 1 }],
      ['DELETE', `/api/floors/${floor.id}`],
      ['POST', `/api/floors/${floor.id}/rooms`, { name: 'X', x: 0, y: 0, w: 100, h: 100 }],
      ['PATCH', `/api/rooms/${room.id}`, { name: 'X', version: 1 }],
      ['POST', `/api/rooms/${room.id}/fixtures`, fixtureBody()],
    ] as const) {
      expect(
        (await h.call(null, method, path, payload)).status,
        `${method} ${path} sans session`,
      ).toBe(401);
      expect(
        (await h.call(stranger, method, path, payload)).status,
        `${method} ${path} étranger`,
      ).toBe(404);
    }
  });

  it('réserve les écritures aux éditeurs', async () => {
    const { property, floor, room } = await withRoom();
    const viewer = await h.addMember(property.id, 'viewer');

    expect((await h.call(viewer, 'GET', url(property.id, '/plan'))).status).toBe(200);
    expect((await h.call(viewer, 'POST', url(property.id, '/floors'), { name: 'X' })).status).toBe(
      403,
    );
    expect((await h.call(viewer, 'DELETE', `/api/floors/${floor.id}`)).status).toBe(403);
    expect(
      (await h.call(viewer, 'POST', `/api/rooms/${room.id}/fixtures`, fixtureBody())).status,
    ).toBe(403);
  });
});
