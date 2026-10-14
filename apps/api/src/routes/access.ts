import type { DbExecutor } from '@tableau-clair/db';
import { and, boardRows, boards, elements, eq, memberships, schema } from '@tableau-clair/db';
import type { Role } from '@tableau-clair/domain';
import { z } from 'zod';
import { forbidden, notFound } from '../http';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** Refuse (403) si le rôle est inférieur au minimum requis. */
export function requireRole(role: Role, minimum: Role) {
  if (RANK[role] < RANK[minimum]) throw forbidden();
}

const uuid = z.string().uuid();

/** Un identifiant mal formé est traité comme une ressource inconnue. */
export function parseId(value: unknown): string {
  const result = uuid.safeParse(value);
  if (!result.success) throw notFound();
  return result.data;
}

/**
 * Rôle de l'utilisateur sur un logement, ou 404 : un logement auquel on n'a pas accès
 * est indiscernable d'un logement inexistant.
 */
export async function propertyAccess(db: DbExecutor, userId: string, propertyId: string) {
  const [row] = await db
    .select({ property: schema.properties, role: memberships.role })
    .from(memberships)
    .innerJoin(schema.properties, eq(schema.properties.id, memberships.propertyId))
    .where(and(eq(memberships.propertyId, propertyId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) throw notFound('Logement');
  return row;
}

export async function boardAccess(db: DbExecutor, userId: string, boardId: string) {
  const [row] = await db
    .select({ board: boards, role: memberships.role })
    .from(boards)
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, boards.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row) throw notFound('Tableau');
  return row;
}

export async function rowAccess(db: DbExecutor, userId: string, rowId: string) {
  const [row] = await db
    .select({ row: boardRows, board: boards, role: memberships.role })
    .from(boardRows)
    .innerJoin(boards, eq(boards.id, boardRows.boardId))
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, boards.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(boardRows.id, rowId))
    .limit(1);
  if (!row) throw notFound('Rangée');
  return row;
}

export async function elementAccess(db: DbExecutor, userId: string, elementId: string) {
  const [row] = await db
    .select({ element: elements, row: boardRows, board: boards, role: memberships.role })
    .from(elements)
    .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
    .innerJoin(boards, eq(boards.id, boardRows.boardId))
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, boards.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(elements.id, elementId))
    .limit(1);
  if (!row) throw notFound('Élément');
  return row;
}

// --- Plan : étages, pièces, équipements -----------------------------------------------------------------

export async function floorAccess(db: DbExecutor, userId: string, floorId: string) {
  const [row] = await db
    .select({ floor: schema.floors, role: memberships.role })
    .from(schema.floors)
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, schema.floors.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(schema.floors.id, floorId))
    .limit(1);
  if (!row) throw notFound('Étage');
  return row;
}

export async function roomAccess(db: DbExecutor, userId: string, roomId: string) {
  const [row] = await db
    .select({ room: schema.rooms, floor: schema.floors, role: memberships.role })
    .from(schema.rooms)
    .innerJoin(schema.floors, eq(schema.floors.id, schema.rooms.floorId))
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, schema.floors.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(schema.rooms.id, roomId))
    .limit(1);
  if (!row) throw notFound('Pièce');
  return row;
}

export async function fixtureAccess(db: DbExecutor, userId: string, fixtureId: string) {
  const [row] = await db
    .select({
      fixture: schema.fixtures,
      room: schema.rooms,
      floor: schema.floors,
      role: memberships.role,
    })
    .from(schema.fixtures)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.fixtures.roomId))
    .innerJoin(schema.floors, eq(schema.floors.id, schema.rooms.floorId))
    .innerJoin(
      memberships,
      and(eq(memberships.propertyId, schema.floors.propertyId), eq(memberships.userId, userId)),
    )
    .where(eq(schema.fixtures.id, fixtureId))
    .limit(1);
  if (!row) throw notFound('Équipement');
  return row;
}
