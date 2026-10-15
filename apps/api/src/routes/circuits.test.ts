import {
  breakerCircuitSchema,
  type Fixture,
  type Floor,
  type Plan,
  type Room,
} from '@tableau-clair/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from './harness';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.drop();
});

async function setup() {
  const s = await h.scenario();
  const floor = (
    await h.call(s.owner, 'POST', `/api/properties/${s.property.id}/floors`, { name: 'RDC' })
  ).body as Floor;
  const room = (
    await h.call(s.owner, 'POST', `/api/floors/${floor.id}/rooms`, {
      name: 'Cuisine',
      x: 100,
      y: 100,
      w: 300,
      h: 200,
    })
  ).body as Room;
  const element = async (extra: Record<string, unknown>) =>
    (await h.call(s.owner, 'POST', `/api/rows/${s.rows[0]!.id}/elements`, extra)).body;
  const breaker = await element({
    position: 4,
    width: 1,
    kind: 'breaker',
    label: 'Prises cuisine',
    ratingA: 16,
  });
  const rcd = await element({ position: 0, width: 2, kind: 'rcd', label: 'Diff' });
  const fixture = async (label = 'Prise plan de travail') =>
    (
      await h.call(s.owner, 'POST', `/api/rooms/${room.id}/fixtures`, {
        kind: 'socket',
        label,
        x: 150,
        y: 150,
      })
    ).body as Fixture;
  return { ...s, floor, room, breaker, rcd, fixture };
}

describe('liaison équipement ↔ disjoncteur', () => {
  it('relie, puis remplace la liaison existante', async () => {
    const s = await setup();
    const other = await (async () =>
      (
        await h.call(s.owner, 'POST', `/api/rows/${s.rows[0]!.id}/elements`, {
          position: 6,
          width: 1,
          kind: 'breaker',
          label: 'Lumières',
        })
      ).body)();
    const fixture = await s.fixture();

    const first = await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: s.breaker.id,
      status: 'assumed',
    });
    expect(first.status).toBe(200);
    expect(first.body.link).toEqual({ breakerId: s.breaker.id, status: 'assumed' });

    const second = await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: other.id,
      status: 'verified',
    });
    expect(second.body.link).toEqual({ breakerId: other.id, status: 'verified' });

    const plan = (await h.call(s.owner, 'GET', `/api/properties/${s.property.id}/plan`))
      .body as Plan;
    expect(plan.breakers.find((b) => b.id === s.breaker.id)?.linkedCount).toBe(0);
    expect(plan.breakers.find((b) => b.id === other.id)?.linkedCount).toBe(1);
  });

  it('délie : l’équipement redevient à identifier', async () => {
    const s = await setup();
    const fixture = await s.fixture();
    await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: s.breaker.id,
      status: 'verified',
    });
    const unlinked = await h.call(s.owner, 'DELETE', `/api/fixtures/${fixture.id}/link`);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.link).toBeNull();
    // Idempotent.
    expect((await h.call(s.owner, 'DELETE', `/api/fixtures/${fixture.id}/link`)).status).toBe(200);
  });

  it('refuse un élément qui n’est pas un disjoncteur', async () => {
    const s = await setup();
    const fixture = await s.fixture();
    const refused = await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: s.rcd.id,
      status: 'assumed',
    });
    expect(refused).toMatchObject({ status: 422, body: { code: 'not_a_breaker' } });
  });

  it('traite un disjoncteur d’un autre logement comme inconnu', async () => {
    const s = await setup();
    const foreign = await h.scenario();
    const foreignBreaker = (
      await h.call(foreign.owner, 'POST', `/api/rows/${foreign.rows[0]!.id}/elements`, {
        position: 0,
        width: 1,
        kind: 'breaker',
        label: 'Étranger',
      })
    ).body;
    const fixture = await s.fixture();
    const res = await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: foreignBreaker.id,
      status: 'assumed',
    });
    expect(res.status).toBe(404);
  });

  it('respecte les droits : lecteur 403, étranger 404', async () => {
    const s = await setup();
    const fixture = await s.fixture();
    const viewer = await h.addMember(s.property.id, 'viewer');
    const stranger = await h.createUser();
    const body = { breakerId: s.breaker.id, status: 'assumed' };
    expect((await h.call(viewer, 'PUT', `/api/fixtures/${fixture.id}/link`, body)).status).toBe(
      403,
    );
    expect((await h.call(viewer, 'DELETE', `/api/fixtures/${fixture.id}/link`)).status).toBe(403);
    expect((await h.call(stranger, 'PUT', `/api/fixtures/${fixture.id}/link`, body)).status).toBe(
      404,
    );
    expect((await h.call(viewer, 'GET', `/api/elements/${s.breaker.id}/circuit`)).status).toBe(200);
    expect((await h.call(stranger, 'GET', `/api/elements/${s.breaker.id}/circuit`)).status).toBe(
      404,
    );
  });

  it('valide le corps', async () => {
    const s = await setup();
    const fixture = await s.fixture();
    const res = await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: 'pas-un-uuid',
      status: 'verified',
    });
    expect(res.status).toBe(400);
  });
});

describe('circuit d’un disjoncteur', () => {
  it('liste les équipements par étage et par pièce, avec la dernière modification', async () => {
    const s = await setup();
    const upstairs = (
      await h.call(s.owner, 'POST', `/api/properties/${s.property.id}/floors`, { name: 'Étage' })
    ).body as Floor;
    const bedroom = (
      await h.call(s.owner, 'POST', `/api/floors/${upstairs.id}/rooms`, {
        name: 'Chambre',
        x: 50,
        y: 50,
        w: 200,
        h: 200,
      })
    ).body as Room;
    const a = await s.fixture('Prise A');
    const b = (
      await h.call(s.owner, 'POST', `/api/rooms/${bedroom.id}/fixtures`, {
        kind: 'socket',
        label: 'Prise B',
        x: 100,
        y: 100,
      })
    ).body as Fixture;
    const unlinked = await s.fixture('Prise orpheline');
    for (const [fixture, status] of [
      [b, 'verified'],
      [a, 'assumed'],
    ] as const) {
      await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
        breakerId: s.breaker.id,
        status,
      });
    }

    const res = await h.call(s.owner, 'GET', `/api/elements/${s.breaker.id}/circuit`);
    expect(res.status).toBe(200);
    const circuit = breakerCircuitSchema.parse(res.body);
    expect(circuit.breaker).toMatchObject({
      id: s.breaker.id,
      label: 'Prises cuisine',
      linkedCount: 2,
    });
    // Ordre : étage 0 (RDC) puis étage 1.
    expect(circuit.fixtures.map((f) => [f.floorName, f.roomName, f.label, f.status])).toEqual([
      ['RDC', 'Cuisine', 'Prise A', 'assumed'],
      ['Étage', 'Chambre', 'Prise B', 'verified'],
    ]);
    expect(circuit.fixtures.some((f) => f.id === unlinked.id)).toBe(false);
    expect(circuit.lastModified?.at).toBeTruthy();
  });

  it('un disjoncteur sans équipement renvoie un circuit vide', async () => {
    const s = await setup();
    const res = await h.call(s.owner, 'GET', `/api/elements/${s.breaker.id}/circuit`);
    expect(res.body.fixtures).toEqual([]);
  });

  it('404 pour un élément qui n’est pas un disjoncteur', async () => {
    const s = await setup();
    expect((await h.call(s.owner, 'GET', `/api/elements/${s.rcd.id}/circuit`)).status).toBe(404);
  });

  it('un disjoncteur supprimé fait passer ses liaisons à inconnu', async () => {
    const s = await setup();
    const fixture = await s.fixture();
    await h.call(s.owner, 'PUT', `/api/fixtures/${fixture.id}/link`, {
      breakerId: s.breaker.id,
      status: 'verified',
    });
    await h.call(s.owner, 'DELETE', `/api/elements/${s.breaker.id}`);
    const plan = (await h.call(s.owner, 'GET', `/api/properties/${s.property.id}/plan`))
      .body as Plan;
    const after = plan.floors.flatMap((f) => f.fixtures).find((f) => f.id === fixture.id);
    expect(after?.link).toEqual({ breakerId: null, status: 'unknown' });
  });
});
