import type { Fixture, Floor, Plan, Room } from '@tableau-clair/contracts';
import { describe, expect, it } from 'vitest';
import {
  addFloor,
  applyFloorOrder,
  findFixture,
  findRoom,
  patchFloor,
  putFixture,
  putRoom,
  removeFixture,
  removeFloor,
  removeRoom,
} from './plan-cache';

const room = (id: string, floorId: string, x = 0): Room =>
  ({ id, floorId, name: id, x, y: 0, w: 100, h: 100 }) as Room;
const fixture = (id: string, roomId: string, x = 10): Fixture =>
  ({ id, roomId, x, y: 10, label: id, kind: 'socket', link: null }) as Fixture;

const plan: Plan = {
  breakers: [],
  floors: [
    {
      id: 'f0',
      index: 0,
      name: 'RDC',
      background: null,
      rooms: [room('r0', 'f0'), room('r1', 'f0', 200)],
      fixtures: [fixture('a', 'r0'), fixture('b', 'r1')],
    },
    {
      id: 'f1',
      index: 1,
      name: 'Étage',
      background: null,
      rooms: [room('r2', 'f1')],
      fixtures: [],
    },
  ],
} as unknown as Plan;

describe('étages', () => {
  it('patchFloor conserve les pièces et équipements', () => {
    const next = patchFloor(plan, { id: 'f0', name: 'Rez' } as Floor);
    expect(next.floors[0]).toMatchObject({ name: 'Rez' });
    expect(next.floors[0]!.rooms).toHaveLength(2);
  });

  it('addFloor insère à son rang', () => {
    const next = addFloor(plan, { id: 'f2', index: 2, name: 'Combles' } as Floor);
    expect(next.floors.map((f) => f.id)).toEqual(['f0', 'f1', 'f2']);
    expect(next.floors[2]).toMatchObject({ rooms: [], fixtures: [], background: null });
  });

  it('removeFloor et applyFloorOrder', () => {
    expect(removeFloor(plan, 'f0').floors.map((f) => f.id)).toEqual(['f1']);
    const ordered = applyFloorOrder(plan, ['f1', 'f0']);
    expect(ordered.floors.map((f) => [f.id, f.index])).toEqual([
      ['f1', 0],
      ['f0', 1],
    ]);
  });
});

describe('pièces', () => {
  it('putRoom met à jour ou ajoute', () => {
    const moved = putRoom(plan, room('r0', 'f0', 50));
    expect(moved.floors[0]!.rooms[0]!.x).toBe(50);
    const added = putRoom(plan, room('r9', 'f1', 300));
    expect(added.floors[1]!.rooms).toHaveLength(2);
  });

  it('removeRoom retire ses équipements', () => {
    const next = removeRoom(plan, 'r0');
    expect(next.floors[0]!.rooms.map((r) => r.id)).toEqual(['r1']);
    expect(next.floors[0]!.fixtures.map((f) => f.id)).toEqual(['b']);
  });
});

describe('équipements', () => {
  it('putFixture met à jour sur place', () => {
    const next = putFixture(plan, fixture('a', 'r0', 80));
    expect(next.floors[0]!.fixtures.find((f) => f.id === 'a')!.x).toBe(80);
    expect(next.floors[0]!.fixtures).toHaveLength(2);
  });

  it('putFixture suit un équipement qui change d’étage', () => {
    const next = putFixture(plan, fixture('a', 'r2'));
    expect(next.floors[0]!.fixtures.map((f) => f.id)).toEqual(['b']);
    expect(next.floors[1]!.fixtures.map((f) => f.id)).toEqual(['a']);
  });

  it('removeFixture et recherches', () => {
    expect(removeFixture(plan, 'a').floors[0]!.fixtures.map((f) => f.id)).toEqual(['b']);
    expect(findFixture(plan, 'b')?.floor.id).toBe('f0');
    expect(findFixture(plan, 'zz')).toBeNull();
    expect(findRoom(plan, 'r2')?.floor.id).toBe('f1');
    expect(findRoom(plan, 'zz')).toBeNull();
  });
});
