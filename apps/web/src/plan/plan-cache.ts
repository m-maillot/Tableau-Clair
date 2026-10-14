import type { Fixture, Floor, Plan, PlanFloor, Room } from '@tableau-clair/contracts';

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
  const entry: PlanFloor = { ...floor, background: null, rooms: [], fixtures: [] };
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
