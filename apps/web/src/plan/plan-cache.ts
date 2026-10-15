import type { Fixture, Floor, Plan, PlanBoard, PlanFloor, Room } from '@tableau-clair/contracts';

/** Mises à jour immuables du plan en cache (retours optimistes et réconciliation serveur). */

const mapFloor = (plan: Plan, floorId: string, change: (floor: PlanFloor) => PlanFloor): Plan => ({
  ...plan,
  floors: plan.floors.map((floor) => (floor.id === floorId ? change(floor) : floor)),
});

/** Met à jour les champs d'un étage (sans toucher à ses pièces ni équipements). */
export function patchFloor(plan: Plan, floor: Floor): Plan {
  return mapFloor(plan, floor.id, (current) => ({ ...current, ...floor }));
}

export function addFloor(plan: Plan, floor: Floor): Plan {
  const entry: PlanFloor = { ...floor, background: null, rooms: [], fixtures: [], boards: [] };
  return { ...plan, floors: [...plan.floors, entry].sort((a, b) => a.index - b.index) };
}

export function removeFloor(plan: Plan, floorId: string): Plan {
  return { ...plan, floors: plan.floors.filter((f) => f.id !== floorId) };
}

export function applyFloorOrder(plan: Plan, ids: string[]): Plan {
  const order = new Map(ids.map((id, index) => [id, index]));
  return {
    ...plan,
    floors: plan.floors
      .map((f) => ({ ...f, index: order.get(f.id) ?? f.index }))
      .sort((a, b) => a.index - b.index),
  };
}

export function putRoom(plan: Plan, room: Room): Plan {
  return mapFloor(plan, room.floorId, (floor) => ({
    ...floor,
    rooms: floor.rooms.some((r) => r.id === room.id)
      ? floor.rooms.map((r) => (r.id === room.id ? room : r))
      : [...floor.rooms, room],
  }));
}

/** Supprime une pièce et, avec elle, ses équipements. */
export function removeRoom(plan: Plan, roomId: string): Plan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      rooms: floor.rooms.filter((r) => r.id !== roomId),
      fixtures: floor.fixtures.filter((f) => f.roomId !== roomId),
    })),
  };
}

/** Remplace (ou ajoute) un équipement ; il peut changer de pièce, donc d'étage. */
export function putFixture(plan: Plan, fixture: Fixture): Plan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      const others = floor.fixtures.filter((f) => f.id !== fixture.id);
      const belongs = floor.rooms.some((r) => r.id === fixture.roomId);
      return { ...floor, fixtures: belongs ? [...others, fixture] : others };
    }),
  };
}

export function removeFixture(plan: Plan, fixtureId: string): Plan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      fixtures: floor.fixtures.filter((f) => f.id !== fixtureId),
    })),
  };
}

export function findFixture(plan: Plan, fixtureId: string) {
  for (const floor of plan.floors) {
    const fixture = floor.fixtures.find((f) => f.id === fixtureId);
    if (fixture) return { fixture, floor };
  }
  return null;
}

export function findRoom(plan: Plan, roomId: string) {
  for (const floor of plan.floors) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (room) return { room, floor };
  }
  return null;
}

/**
 * Applique une liaison (ou son retrait) à un équipement et recalcule les compteurs des
 * disjoncteurs concernés, sans attendre le serveur.
 */
export function setFixtureLink(plan: Plan, fixtureId: string, link: Fixture['link']): Plan {
  const found = findFixture(plan, fixtureId);
  if (!found) return plan;
  const from = found.fixture.link?.breakerId ?? null;
  const to = link?.breakerId ?? null;
  const next = putFixture(plan, { ...found.fixture, link });
  if (from === to) return next;
  return {
    ...next,
    breakers: next.breakers.map((b) =>
      b.id === from
        ? { ...b, linkedCount: Math.max(0, b.linkedCount - 1) }
        : b.id === to
          ? { ...b, linkedCount: b.linkedCount + 1 }
          : b,
    ),
  };
}

/** Déplace un tableau sur le plan (il peut changer d'étage). */
export function putBoardPosition(
  plan: Plan,
  boardId: string,
  floorId: string,
  x: number,
  y: number,
): Plan {
  let board: PlanBoard | undefined;
  for (const floor of plan.floors) {
    board = board ?? floor.boards.find((b) => b.id === boardId);
  }
  if (!board) return plan;
  const moved = { ...board, x, y };
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      boards: [
        ...floor.boards.filter((b) => b.id !== boardId),
        ...(floor.id === floorId ? [moved] : []),
      ],
    })),
  };
}
