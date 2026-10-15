import {
  createFixtureSchema,
  createFloorSchema,
  createRoomSchema,
  FLOOR_DEFAULTS,
  reorderFloorsSchema,
  updateFixtureSchema,
  updateFloorSchema,
  updateRoomSchema,
  type Fixture,
  type Floor,
  type Plan,
  type PlanBreaker,
  type Room,
} from '@tableau-clair/contracts';
import {
  and,
  asc,
  boardRows,
  boards,
  circuits,
  elements,
  eq,
  fixtures,
  floors,
  inArray,
  rooms,
  schema,
  sql,
  type Database,
  type DbExecutor,
} from '@tableau-clair/db';
import {
  clampPoint,
  containsPoint,
  MIN_ROOM_SIZE,
  rectWithin,
  shiftPoint,
  type Rect,
} from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { conflict, notFound, parseBody, unprocessable } from '../http';
import type { ObjectStorage } from '../storage/object-storage';
import {
  fixtureAccess,
  floorAccess,
  parseId,
  propertyAccess,
  requireRole,
  roomAccess,
} from './access';
import { assertPhotoInProperty } from './boards';
import { linkedCounts } from './board-loader';

type FloorRow = typeof floors.$inferSelect;
type RoomRow = typeof rooms.$inferSelect;
type FixtureRow = typeof fixtures.$inferSelect;
type LinkRow = { breakerId: string | null; status: 'verified' | 'assumed' | 'unknown' };

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);
const iso = (d: Date) => d.toISOString();
const audit = (r: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
  version: number;
}) => ({
  id: r.id,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  updatedBy: r.updatedBy,
  version: r.version,
});

const toFloor = (r: FloorRow): Floor => ({
  ...audit(r),
  propertyId: r.propertyId,
  name: r.name,
  index: r.index,
  width: r.width,
  height: r.height,
  backgroundImageId: r.backgroundImageId,
  backgroundOpacity: r.backgroundOpacity,
  backgroundX: r.backgroundX,
  backgroundY: r.backgroundY,
  backgroundScale: r.backgroundScale,
  backgroundLocked: r.backgroundLocked,
});

const toRoom = (r: RoomRow): Room => ({
  ...audit(r),
  floorId: r.floorId,
  name: r.name,
  x: r.x,
  y: r.y,
  w: r.w,
  h: r.h,
});

const toFixture = (r: FixtureRow, link: LinkRow | null): Fixture => ({
  ...audit(r),
  roomId: r.roomId,
  kind: r.kind,
  label: r.label,
  x: r.x,
  y: r.y,
  notes: r.notes,
  photoId: r.photoId,
  link,
});

const rectOf = (r: { x: number; y: number; w: number; h: number }): Rect => ({
  x: r.x,
  y: r.y,
  w: r.w,
  h: r.h,
});

async function linkOf(db: DbExecutor, fixtureId: string): Promise<LinkRow | null> {
  const [row] = await db
    .select({ breakerId: circuits.breakerId, status: circuits.status })
    .from(circuits)
    .where(eq(circuits.fixtureId, fixtureId))
    .limit(1);
  return row ?? null;
}

/** Un équipement avec sa liaison actuelle. */
export async function loadFixture(db: DbExecutor, fixtureId: string): Promise<Fixture> {
  const [row] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId)).limit(1);
  if (!row) throw notFound('Équipement');
  return toFixture(row, await linkOf(db, fixtureId));
}

/** Disjoncteurs d'un logement, dans l'ordre du tableau, avec le nombre d'équipements qu'ils alimentent. */
export async function loadBreakers(db: DbExecutor, propertyId: string): Promise<PlanBreaker[]> {
  const rows = await db
    .select({
      id: elements.id,
      label: elements.label,
      ratingA: elements.ratingA,
      position: elements.position,
      photoId: elements.photoId,
      rowIndex: boardRows.index,
      boardId: boards.id,
      boardName: boards.name,
    })
    .from(elements)
    .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
    .innerJoin(boards, eq(boards.id, boardRows.boardId))
    .where(and(eq(boards.propertyId, propertyId), eq(elements.kind, 'breaker')))
    .orderBy(asc(boards.name), asc(boardRows.index), asc(elements.position));
  const counts = await linkedCounts(
    db,
    rows.map((b) => b.id),
  );
  return rows.map((b) => ({
    id: b.id,
    label: b.label,
    ratingA: b.ratingA,
    boardId: b.boardId,
    boardName: b.boardName,
    rowIndex: b.rowIndex,
    position: b.position,
    linkedCount: counts.get(b.id) ?? 0,
    photoId: b.photoId,
  }));
}

/** Plan complet d'un logement : étages, pièces, équipements avec leur liaison, disjoncteurs. */
export async function loadPlan(db: DbExecutor, propertyId: string): Promise<Plan> {
  const floorRows = await db
    .select()
    .from(floors)
    .where(eq(floors.propertyId, propertyId))
    .orderBy(asc(floors.index));
  const floorIds = floorRows.map((f) => f.id);

  const roomRows = floorIds.length
    ? await db.select().from(rooms).where(inArray(rooms.floorId, floorIds))
    : [];
  const roomIds = roomRows.map((r) => r.id);
  const fixtureRows = roomIds.length
    ? await db.select().from(fixtures).where(inArray(fixtures.roomId, roomIds))
    : [];
  const fixtureIds = fixtureRows.map((f) => f.id);
  const linkRows = fixtureIds.length
    ? await db
        .select({
          fixtureId: circuits.fixtureId,
          breakerId: circuits.breakerId,
          status: circuits.status,
        })
        .from(circuits)
        .where(inArray(circuits.fixtureId, fixtureIds))
    : [];
  const links = new Map(
    linkRows.map((l) => [l.fixtureId, { breakerId: l.breakerId, status: l.status }]),
  );

  const photoIds = floorRows.flatMap((f) => (f.backgroundImageId ? [f.backgroundImageId] : []));
  const photoRows = photoIds.length
    ? await db
        .select({ id: schema.photos.id, width: schema.photos.width, height: schema.photos.height })
        .from(schema.photos)
        .where(inArray(schema.photos.id, photoIds))
    : [];
  const photos = new Map(photoRows.map((p) => [p.id, { width: p.width, height: p.height }]));

  const breakers = await loadBreakers(db, propertyId);

  return {
    floors: floorRows.map((floor) => {
      const floorRooms = roomRows.filter((r) => r.floorId === floor.id);
      const roomSet = new Set(floorRooms.map((r) => r.id));
      return {
        ...toFloor(floor),
        background: floor.backgroundImageId ? (photos.get(floor.backgroundImageId) ?? null) : null,
        rooms: floorRooms.map(toRoom),
        fixtures: fixtureRows
          .filter((f) => roomSet.has(f.roomId))
          .map((f) => toFixture(f, links.get(f.id) ?? null)),
      };
    }),
    breakers,
  };
}

/** Une pièce, ses limites et la place qu'elle laisse au canevas. */
function assertRoomGeometry(canvas: { width: number; height: number }, rect: Rect) {
  if (rect.w < MIN_ROOM_SIZE || rect.h < MIN_ROOM_SIZE) {
    throw unprocessable(
      'too_small',
      `Une pièce mesure au moins ${MIN_ROOM_SIZE} × ${MIN_ROOM_SIZE}.`,
      {
        minimum: MIN_ROOM_SIZE,
      },
    );
  }
  if (!rectWithin({ w: canvas.width, h: canvas.height }, rect)) {
    throw unprocessable('out_of_bounds', 'La pièce dépasse du plan.');
  }
}

export function registerPlanRoutes(app: FastifyInstance, db: Database, storage: ObjectStorage) {
  // --- Lecture -------------------------------------------------------------------------------------------
  app.get('/api/properties/:id/plan', async (request) => {
    const propertyId = idOf(request);
    await propertyAccess(db, request.userId, propertyId);
    return loadPlan(db, propertyId);
  });

  // --- Étages ---------------------------------------------------------------------------------------------
  app.post('/api/properties/:id/floors', async (request, reply) => {
    const propertyId = idOf(request);
    const input = parseBody(createFloorSchema, request.body);
    const { role } = await propertyAccess(db, request.userId, propertyId);
    requireRole(role, 'editor');

    const created = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number>`coalesce(max(${floors.index}), -1)::int` })
        .from(floors)
        .where(eq(floors.propertyId, propertyId));
      const [floor] = await tx
        .insert(floors)
        .values({
          propertyId,
          name: input.name,
          index: (last?.max ?? -1) + 1,
          width: FLOOR_DEFAULTS.width,
          height: FLOOR_DEFAULTS.height,
          updatedBy: request.userId,
        })
        .returning();
      return floor!;
    });
    return reply.code(201).send(toFloor(created));
  });

  // Ordre des onglets : remplacé en une fois (deux temps pour respecter l'unicité de l'index).
  app.put('/api/properties/:id/floors/order', async (request) => {
    const propertyId = idOf(request);
    const input = parseBody(reorderFloorsSchema, request.body);
    const { role } = await propertyAccess(db, request.userId, propertyId);
    requireRole(role, 'editor');

    return db.transaction(async (tx) => {
      const current = await tx
        .select({ id: floors.id })
        .from(floors)
        .where(eq(floors.propertyId, propertyId));
      const same =
        current.length === input.ids.length &&
        new Set(input.ids).size === input.ids.length &&
        input.ids.every((id) => current.some((f) => f.id === id));
      if (!same) {
        throw unprocessable(
          'invalid_order',
          'La liste doit contenir exactement les étages du logement.',
        );
      }
      await tx
        .update(floors)
        .set({ index: sql`${floors.index} + 1000` })
        .where(eq(floors.propertyId, propertyId));
      for (const [index, id] of input.ids.entries()) {
        await tx.update(floors).set({ index, updatedBy: request.userId }).where(eq(floors.id, id));
      }
      const rows = await tx
        .select()
        .from(floors)
        .where(eq(floors.propertyId, propertyId))
        .orderBy(asc(floors.index));
      return rows.map(toFloor);
    });
  });

  app.patch('/api/floors/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updateFloorSchema, request.body);

    const result = await db.transaction(async (tx) => {
      const { floor, role } = await floorAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      const [locked] = await tx.select().from(floors).where(eq(floors.id, id)).for('update');
      if (!locked) throw notFound('Étage');
      if (locked.version !== input.version) throw conflict(toFloor(locked));

      if (input.backgroundImageId) {
        await assertPhotoInProperty(tx, input.backgroundImageId, floor.propertyId);
      }
      // Réduire le plan ne doit pas faire sortir une pièce.
      const width = input.width ?? locked.width;
      const height = input.height ?? locked.height;
      if (width !== locked.width || height !== locked.height) {
        const existing = await tx.select().from(rooms).where(eq(rooms.floorId, id));
        const outside = existing.find((r) => !rectWithin({ w: width, h: height }, rectOf(r)));
        if (outside) {
          throw unprocessable('rooms_outside', `La pièce « ${outside.name} » sortirait du plan.`);
        }
      }

      const [updated] = await tx
        .update(floors)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.backgroundImageId !== undefined
            ? { backgroundImageId: input.backgroundImageId }
            : {}),
          ...(input.backgroundOpacity !== undefined
            ? { backgroundOpacity: input.backgroundOpacity }
            : {}),
          ...(input.backgroundX !== undefined ? { backgroundX: input.backgroundX } : {}),
          ...(input.backgroundY !== undefined ? { backgroundY: input.backgroundY } : {}),
          ...(input.backgroundScale !== undefined
            ? { backgroundScale: input.backgroundScale }
            : {}),
          ...(input.backgroundLocked !== undefined
            ? { backgroundLocked: input.backgroundLocked }
            : {}),
          updatedBy: request.userId,
        })
        .where(eq(floors.id, id))
        .returning();

      // Image de fond remplacée ou retirée : l'ancienne n'est plus référencée, on la supprime.
      let orphan: { id: string; objectKey: string } | undefined;
      const previous = locked.backgroundImageId;
      if (previous && updated!.backgroundImageId !== previous) {
        const [photo] = await tx
          .delete(schema.photos)
          .where(eq(schema.photos.id, previous))
          .returning({ id: schema.photos.id, objectKey: schema.photos.objectKey });
        orphan = photo;
      }
      return { floor: updated!, orphan };
    });

    if (result.orphan) {
      await storage.delete(result.orphan.objectKey).catch((error: unknown) => {
        request.log.error({ err: error }, 'Fichier orphelin non supprimé');
      });
    }
    return toFloor(result.floor);
  });

  app.delete('/api/floors/:id', async (request, reply) => {
    const { floor, role } = await floorAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    const photos = floor.backgroundImageId
      ? await db
          .select({ key: schema.photos.objectKey })
          .from(schema.photos)
          .where(eq(schema.photos.id, floor.backgroundImageId))
      : [];
    await db.delete(floors).where(eq(floors.id, floor.id));
    if (floor.backgroundImageId) {
      await db.delete(schema.photos).where(eq(schema.photos.id, floor.backgroundImageId));
      await storage.deleteMany(photos.map((p) => p.key)).catch(() => undefined);
    }
    return reply.code(204).send();
  });

  // --- Pièces --------------------------------------------------------------------------------------------
  app.post('/api/floors/:id/rooms', async (request, reply) => {
    const input = parseBody(createRoomSchema, request.body);
    const { floor, role } = await floorAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    assertRoomGeometry(floor, input);

    const [created] = await db
      .insert(rooms)
      .values({
        floorId: floor.id,
        name: input.name,
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        updatedBy: request.userId,
      })
      .returning();
    return reply.code(201).send(toRoom(created!));
  });

  app.patch('/api/rooms/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updateRoomSchema, request.body);

    return db.transaction(async (tx) => {
      const { floor, role } = await roomAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      const [locked] = await tx.select().from(rooms).where(eq(rooms.id, id)).for('update');
      if (!locked) throw notFound('Pièce');
      if (locked.version !== input.version) throw conflict(toRoom(locked));

      const next: Rect = {
        x: input.x ?? locked.x,
        y: input.y ?? locked.y,
        w: input.w ?? locked.w,
        h: input.h ?? locked.h,
      };
      assertRoomGeometry(floor, next);

      const [updated] = await tx
        .update(rooms)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...next,
          updatedBy: request.userId,
        })
        .where(eq(rooms.id, id))
        .returning();

      // Les équipements suivent la pièce déplacée ; si elle change de taille, ils sont ramenés dedans.
      const moved = next.x !== locked.x || next.y !== locked.y;
      const resized = next.w !== locked.w || next.h !== locked.h;
      if (moved || resized) {
        const inside = await tx.select().from(fixtures).where(eq(fixtures.roomId, id));
        for (const fixture of inside) {
          const point = resized
            ? clampPoint(next, shiftPoint(fixture, next.x - locked.x, next.y - locked.y))
            : shiftPoint(fixture, next.x - locked.x, next.y - locked.y);
          await tx
            .update(fixtures)
            .set({ x: point.x, y: point.y, updatedBy: request.userId })
            .where(eq(fixtures.id, fixture.id));
        }
      }
      return toRoom(updated!);
    });
  });

  app.delete('/api/rooms/:id', async (request, reply) => {
    const { room, role } = await roomAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    // Les équipements de la pièce disparaissent avec elle ; leurs liaisons aussi (cascade).
    await db.delete(rooms).where(eq(rooms.id, room.id));
    return reply.code(204).send();
  });

  // --- Équipements du plan ------------------------------------------------------------------------------------
  app.post('/api/rooms/:id/fixtures', async (request, reply) => {
    const input = parseBody(createFixtureSchema, request.body);
    const { room, floor, role } = await roomAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    if (!containsPoint(rectOf(room), input)) {
      throw unprocessable('outside_room', 'L’équipement doit être placé dans la pièce.');
    }
    await assertPhotoInProperty(db, input.photoId, floor.propertyId);

    const [created] = await db
      .insert(fixtures)
      .values({
        roomId: room.id,
        kind: input.kind,
        label: input.label,
        x: input.x,
        y: input.y,
        notes: input.notes ?? null,
        photoId: input.photoId ?? null,
        updatedBy: request.userId,
      })
      .returning();
    return reply.code(201).send(toFixture(created!, null));
  });

  app.patch('/api/fixtures/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updateFixtureSchema, request.body);

    return db.transaction(async (tx) => {
      const { fixture, floor, role } = await fixtureAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      const [locked] = await tx.select().from(fixtures).where(eq(fixtures.id, id)).for('update');
      if (!locked) throw notFound('Équipement');
      if (locked.version !== input.version) {
        throw conflict(toFixture(locked, await linkOf(tx, id)));
      }

      // Pièce de destination : du même logement.
      let target: Rect = { x: 0, y: 0, w: 0, h: 0 };
      const targetRoomId = input.roomId ?? fixture.roomId;
      const [room] = await tx
        .select({ room: rooms })
        .from(rooms)
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .where(and(eq(rooms.id, targetRoomId), eq(floors.propertyId, floor.propertyId)))
        .limit(1);
      if (!room) throw unprocessable('room_not_found', 'Pièce de destination introuvable.');
      target = rectOf(room.room);

      const point = { x: input.x ?? locked.x, y: input.y ?? locked.y };
      if (!containsPoint(target, point)) {
        throw unprocessable('outside_room', 'L’équipement doit être placé dans la pièce.');
      }
      await assertPhotoInProperty(tx, input.photoId, floor.propertyId);

      const [updated] = await tx
        .update(fixtures)
        .set({
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.photoId !== undefined ? { photoId: input.photoId } : {}),
          roomId: targetRoomId,
          x: point.x,
          y: point.y,
          updatedBy: request.userId,
        })
        .where(eq(fixtures.id, id))
        .returning();
      return toFixture(updated!, await linkOf(tx, id));
    });
  });

  app.delete('/api/fixtures/:id', async (request, reply) => {
    const { fixture, role } = await fixtureAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    await db.delete(fixtures).where(eq(fixtures.id, fixture.id));
    return reply.code(204).send();
  });
}
