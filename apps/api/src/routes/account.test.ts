import {
  accountSummarySchema,
  type Fixture,
  type Floor,
  type Room,
} from '@tableau-clair/contracts';
import { eq, schema } from '@tableau-clair/db';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from './harness';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.drop();
});

async function emailOf(userId: string) {
  const [user] = await h.db.select().from(schema.users).where(eq(schema.users.id, userId));
  return user!.email;
}

describe('résumé du compte', () => {
  it('sépare les logements supprimés de ceux qui sont seulement quittés', async () => {
    const { owner, property } = await h.scenario();
    // Un second logement dont l'utilisateur n'est qu'éditeur.
    const other = await h.scenario();
    await h.db
      .insert(schema.memberships)
      .values({ propertyId: other.property.id, userId: owner, role: 'editor' });
    // Un logement co-possédé : il survit à son départ.
    const shared = await h.scenario();
    await h.db
      .insert(schema.memberships)
      .values({ propertyId: shared.property.id, userId: owner, role: 'owner' });
    // Un membre supplémentaire sur le logement dont il est seul propriétaire.
    await h.addMember(property.id, 'viewer');

    const res = await h.call(owner, 'GET', '/api/account');
    expect(res.status).toBe(200);
    const summary = accountSummarySchema.parse(res.body);
    expect(summary.email).toBe(await emailOf(owner));
    expect(summary.deletedProperties).toEqual([
      { id: property.id, name: 'Maison', boardCount: 1, otherMembers: 1 },
    ]);
    expect(summary.leftProperties.map((p) => p.id).sort()).toEqual(
      [other.property.id, shared.property.id].sort(),
    );
  });

  it('exige une session', async () => {
    expect((await h.call(null, 'GET', '/api/account')).status).toBe(401);
    expect((await h.call(null, 'GET', '/api/account/export')).status).toBe(401);
    expect((await h.call(null, 'DELETE', '/api/account', { confirm: 'x' })).status).toBe(401);
  });
});

describe('export', () => {
  it('contient le compte, les tableaux, le plan, les modèles et les photos — et seulement les siens', async () => {
    const { owner, property, board, rows } = await h.scenario('Martial');
    await h.call(owner, 'POST', `/api/rows/${rows[0]!.id}/elements`, {
      position: 0,
      width: 1,
      kind: 'breaker',
      label: 'Prises cuisine',
      ratingA: 16,
    });
    const floor = (
      await h.call(owner, 'POST', `/api/properties/${property.id}/floors`, { name: 'RDC' })
    ).body as Floor;
    const room = (
      await h.call(owner, 'POST', `/api/floors/${floor.id}/rooms`, {
        name: 'Cuisine',
        x: 10,
        y: 10,
        w: 300,
        h: 200,
      })
    ).body as Room;
    (await h.call(owner, 'POST', `/api/rooms/${room.id}/fixtures`, {
      kind: 'socket',
      label: 'Prise four',
      x: 50,
      y: 50,
    })) as { body: Fixture };
    await h.call(owner, 'POST', '/api/custom-models', { label: 'Borne', width: 4 });
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer();
    await h.app.inject({
      method: 'POST',
      url: `/api/properties/${property.id}/photos?usage=board`,
      payload: png,
      headers: { 'x-user-id': owner, 'content-type': 'image/jpeg' },
    });
    // Données d'une autre personne : jamais dans l'export.
    const stranger = await h.scenario();

    const response = await h.app.inject({
      method: 'GET',
      url: '/api/account/export',
      headers: { 'x-user-id': owner },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="tableau-clair-export-/,
    );
    const data = JSON.parse(response.body);

    expect(data.account.email).toBe(await emailOf(owner));
    expect(data.customModels).toEqual([
      { label: 'Borne', role: null, brand: null, model: null, width: 4 },
    ]);
    expect(data.properties).toHaveLength(1);
    const exported = data.properties[0];
    expect(exported).toMatchObject({ id: property.id, name: 'Maison', role: 'owner' });
    expect(exported.boards[0]).toMatchObject({ id: board.id, name: 'Tableau principal' });
    expect(exported.boards[0].rows[0].elements[0]).toMatchObject({ label: 'Prises cuisine' });
    expect(exported.plan.floors[0].rooms[0].name).toBe('Cuisine');
    expect(exported.plan.floors[0].fixtures[0].label).toBe('Prise four');
    expect(exported.photos).toHaveLength(1);
    expect(exported.photos[0].contentUrl).toMatch(/^\/api\/photos\/.+\/content$/);
    expect(response.body).not.toContain(stranger.property.id);
  });
});

describe('suppression', () => {
  it('exige l’adresse exacte du compte', async () => {
    const { owner } = await h.scenario();
    const refused = await h.call(owner, 'DELETE', '/api/account', { confirm: 'autre@test.local' });
    expect(refused).toMatchObject({ status: 422, body: { code: 'confirmation_mismatch' } });
    expect((await h.call(owner, 'GET', '/api/account')).status).toBe(200);
  });

  it('supprime le compte et ses logements, conserve les logements partagés avec un autre propriétaire', async () => {
    const solo = await h.scenario();
    const owner = solo.owner;
    const co = await h.scenario();
    await h.db
      .insert(schema.memberships)
      .values({ propertyId: co.property.id, userId: owner, role: 'owner' });
    const other = await h.scenario();
    await h.db
      .insert(schema.memberships)
      .values({ propertyId: other.property.id, userId: owner, role: 'viewer' });
    await h.call(owner, 'POST', '/api/custom-models', { label: 'Borne', width: 4 });
    const email = await emailOf(owner);

    const res = await h.call(owner, 'DELETE', '/api/account', {
      confirm: ` ${email.toUpperCase()} `,
    });
    expect(res.status).toBe(204);

    expect(await h.db.select().from(schema.users).where(eq(schema.users.id, owner))).toHaveLength(
      0,
    );
    expect(
      await h.db.select().from(schema.properties).where(eq(schema.properties.id, solo.property.id)),
    ).toHaveLength(0);
    expect(
      await h.db.select().from(schema.boards).where(eq(schema.boards.id, solo.board.id)),
    ).toHaveLength(0);
    // Les logements des autres survivent, sans lui.
    for (const kept of [co.property.id, other.property.id]) {
      expect(
        await h.db.select().from(schema.properties).where(eq(schema.properties.id, kept)),
      ).toHaveLength(1);
    }
    expect(
      await h.db.select().from(schema.memberships).where(eq(schema.memberships.userId, owner)),
    ).toHaveLength(0);
    expect(
      await h.db.select().from(schema.customModels).where(eq(schema.customModels.userId, owner)),
    ).toHaveLength(0);
  });

  it('retire aussi les photos du logement supprimé', async () => {
    const { owner, property } = await h.scenario();
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();
    const up = await h.app.inject({
      method: 'POST',
      url: `/api/properties/${property.id}/photos?usage=board`,
      payload: image,
      headers: { 'x-user-id': owner, 'content-type': 'image/jpeg' },
    });
    expect(up.statusCode).toBe(201);
    const email = await emailOf(owner);
    expect((await h.call(owner, 'DELETE', '/api/account', { confirm: email })).status).toBe(204);
    expect(
      await h.db.select().from(schema.photos).where(eq(schema.photos.propertyId, property.id)),
    ).toHaveLength(0);
  });
});
