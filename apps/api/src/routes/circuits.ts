import { setFixtureLinkSchema, type BreakerCircuit, type Fixture } from '@tableau-clair/contracts';
import {
  and,
  asc,
  circuits,
  eq,
  fixtures,
  floors,
  rooms,
  schema,
  type Database,
  type DbExecutor,
} from '@tableau-clair/db';
import { linkFixture } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { notFound, parseBody, unprocessable } from '../http';
import { elementAccess, fixtureAccess, parseId, requireRole } from './access';
import { loadBreakers, loadFixture } from './plan';

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);

export function registerCircuitRoutes(app: FastifyInstance, db: Database) {
  // --- Relier un équipement à un disjoncteur (remplace la liaison existante) -------------------------
  app.put('/api/fixtures/:id/link', async (request): Promise<Fixture> => {
    const id = idOf(request);
    const input = parseBody(setFixtureLinkSchema, request.body);

    return db.transaction(async (tx) => {
      const { fixture, floor, role } = await fixtureAccess(tx, request.userId, id);
      requireRole(role, 'editor');

      // Le disjoncteur doit appartenir au même logement : sinon il est indiscernable d'un inconnu.
      const target = await elementInProperty(tx, input.breakerId, floor.propertyId);
      if (!target) throw notFound('Disjoncteur');
      const checked = linkFixture(
        [],
        { fixtureId: id, breakerId: target.id, status: input.status },
        [target],
      );
      if (!checked.ok) {
        throw unprocessable('not_a_breaker', 'Seul un disjoncteur peut alimenter un équipement.');
      }

      await tx
        .insert(circuits)
        .values({
          fixtureId: id,
          breakerId: input.breakerId,
          status: input.status,
          updatedBy: request.userId,
        })
        .onConflictDoUpdate({
          target: circuits.fixtureId,
          set: {
            breakerId: input.breakerId,
            status: input.status,
            updatedBy: request.userId,
          },
        });
      return loadFixture(tx, fixture.id);
    });
  });

  // --- Délier : l'équipement redevient « à identifier » -------------------------------------------------
  app.delete('/api/fixtures/:id/link', async (request): Promise<Fixture> => {
    const id = idOf(request);
    return db.transaction(async (tx) => {
      const { role } = await fixtureAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      await tx.delete(circuits).where(eq(circuits.fixtureId, id));
      return loadFixture(tx, id);
    });
  });

  // --- Circuit d'un disjoncteur : équipements alimentés, par étage et par pièce -----------------------
  app.get('/api/elements/:id/circuit', async (request): Promise<BreakerCircuit> => {
    const id = idOf(request);
    const { board, element } = await elementAccess(db, request.userId, id);
    if (element.kind !== 'breaker') throw notFound('Disjoncteur');

    const breaker = (await loadBreakers(db, board.propertyId)).find((b) => b.id === id);
    if (!breaker) throw notFound('Disjoncteur');

    const rows = await db
      .select({
        id: fixtures.id,
        label: fixtures.label,
        kind: fixtures.kind,
        status: circuits.status,
        roomId: rooms.id,
        roomName: rooms.name,
        floorId: floors.id,
        floorName: floors.name,
        linkedAt: circuits.updatedAt,
        linkedBy: circuits.updatedBy,
      })
      .from(circuits)
      .innerJoin(fixtures, eq(fixtures.id, circuits.fixtureId))
      .innerJoin(rooms, eq(rooms.id, fixtures.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .where(and(eq(circuits.breakerId, id), eq(floors.propertyId, board.propertyId)))
      .orderBy(asc(floors.index), asc(rooms.name), asc(fixtures.label));

    // Dernière modification : le disjoncteur lui-même ou l'une de ses liaisons.
    const candidates = [
      { at: element.updatedAt, by: element.updatedBy },
      ...rows.map((r) => ({ at: r.linkedAt, by: r.linkedBy })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    const latest = candidates[0]!;
    let by: string | null = null;
    if (latest.by) {
      const [user] = await db
        .select({ name: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, latest.by))
        .limit(1);
      by = user?.name || user?.email || null;
    }

    return {
      breaker,
      fixtures: rows.map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind,
        status: r.status,
        roomId: r.roomId,
        roomName: r.roomName,
        floorId: r.floorId,
        floorName: r.floorName,
      })),
      lastModified: { at: latest.at.toISOString(), by },
    };
  });
}

async function elementInProperty(db: DbExecutor, elementId: string, propertyId: string) {
  const [row] = await db
    .select({ id: schema.elements.id, kind: schema.elements.kind })
    .from(schema.elements)
    .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.elements.rowId))
    .innerJoin(schema.boards, eq(schema.boards.id, schema.boardRows.boardId))
    .where(and(eq(schema.elements.id, elementId), eq(schema.boards.propertyId, propertyId)))
    .limit(1);
  return row ?? null;
}
