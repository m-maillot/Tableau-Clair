import {
  createBoardSchema,
  duplicateBoardSchema,
  LIMITS,
  updateBoardSchema,
  type Board,
  type BoardImpact,
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
import { minRowCapacity, setRowCapacity } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { conflict, notFound, parseBody, unprocessable } from '../http';
import { boardAccess, parseId, propertyAccess, requireRole } from './access';
import { centerSpot } from './board-plan';
import { loadBoard, loadRails } from './board-loader';
import { toBoardSummary } from './serialize';

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);

/** Une photo référencée doit appartenir au même logement. */
export async function assertPhotoInProperty(
  db: DbExecutor,
  photoId: string | null | undefined,
  propertyId: string,
) {
  if (!photoId) return;
  const [photo] = await db
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.propertyId, propertyId)))
    .limit(1);
  if (!photo) throw unprocessable('photo_not_found', 'Photo introuvable dans ce logement');
}

export function registerBoardRoutes(app: FastifyInstance, db: Database) {
  // --- Liste des tableaux d'un logement ----------------------------------------------------------
  app.get('/api/properties/:id/boards', async (request) => {
    const propertyId = idOf(request);
    await propertyAccess(db, request.userId, propertyId);

    const list = await db
      .select()
      .from(boards)
      .where(eq(boards.propertyId, propertyId))
      .orderBy(asc(boards.name));
    if (list.length === 0) return [];

    const rails = await db
      .select()
      .from(boardRows)
      .where(
        inArray(
          boardRows.boardId,
          list.map((b) => b.id),
        ),
      );
    const items = rails.length
      ? await db
          .select({ rowId: elements.rowId, width: elements.width })
          .from(elements)
          .where(
            inArray(
              elements.rowId,
              rails.map((r) => r.id),
            ),
          )
      : [];

    return list.map((board) => {
      const boardRails = rails.filter((r) => r.boardId === board.id);
      const ids = new Set(boardRails.map((r) => r.id));
      const used = items.filter((i) => ids.has(i.rowId)).reduce((sum, i) => sum + i.width, 0);
      return toBoardSummary(board, boardRails, used);
    });
  });

  // --- Création ----------------------------------------------------------------------------------------
  app.post('/api/properties/:id/boards', async (request, reply) => {
    const propertyId = idOf(request);
    const input = parseBody(createBoardSchema, request.body);
    const { role } = await propertyAccess(db, request.userId, propertyId);
    requireRole(role, 'editor');

    const created = await db.transaction(async (tx) => {
      await assertPhotoInProperty(tx, input.photoId, propertyId);
      const [board] = await tx
        .insert(boards)
        .values({
          propertyId,
          name: input.name,
          location: input.location ?? null,
          photoId: input.photoId ?? null,
          rows: input.rowCount,
          modulesPerRow: input.modulesPerRow,
          notes: input.notes ?? null,
          // Règle : un tableau est aussi un équipement du plan, posé au centre à sa création.
          ...(await centerSpot(tx, propertyId, request.userId)),
          updatedBy: request.userId,
        })
        .returning();
      await tx.insert(boardRows).values(
        Array.from({ length: input.rowCount }, (_, index) => ({
          boardId: board!.id,
          index,
          capacity: input.modulesPerRow,
          updatedBy: request.userId,
        })),
      );
      return loadBoard(tx, board!);
    });
    return reply.code(201).send(created);
  });

  // --- Lecture --------------------------------------------------------------------------------------------
  app.get('/api/boards/:id', async (request) => {
    const { board } = await boardAccess(db, request.userId, idOf(request));
    return loadBoard(db, board);
  });

  // --- Modification, y compris la géométrie ----------------------------------------------------------
  app.patch('/api/boards/:id', async (request): Promise<Board> => {
    const id = idOf(request);
    const input = parseBody(updateBoardSchema, request.body);

    return db.transaction(async (tx) => {
      const { board, role } = await boardAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      // Verrou : sérialise avec les écritures concurrentes sur les rangées du tableau.
      const [locked] = await tx.select().from(boards).where(eq(boards.id, id)).for('update');
      if (!locked) throw notFound('Tableau');
      if (locked.version !== input.version) throw conflict(await loadBoard(tx, locked));
      await assertPhotoInProperty(tx, input.photoId, board.propertyId);

      const targetRows = input.rowCount ?? locked.rows;
      const targetModules = input.modulesPerRow ?? locked.modulesPerRow;

      await tx
        .select({ id: boardRows.id })
        .from(boardRows)
        .where(eq(boardRows.boardId, id))
        .for('update');
      const { rails, byRow } = await loadRails(tx, id);

      // Rangées retirées : uniquement si elles sont vides.
      const removed = rails.filter((r) => r.index >= targetRows);
      for (const rail of removed) {
        if ((byRow.get(rail.id) ?? []).length > 0) {
          throw unprocessable(
            'row_not_empty',
            `La rangée ${rail.index + 1} contient des éléments`,
            {
              rowIndex: rail.index,
            },
          );
        }
      }
      if (removed.length > 0) {
        await tx.delete(boardRows).where(
          inArray(
            boardRows.id,
            removed.map((r) => r.id),
          ),
        );
      }

      // Capacité : refusée si un élément dépasserait.
      if (targetModules !== locked.modulesPerRow) {
        for (const rail of rails.filter((r) => r.index < targetRows)) {
          const placed = (byRow.get(rail.id) ?? []).map((e) => ({
            id: e.id,
            position: e.position,
            width: e.width,
          }));
          const result = setRowCapacity(
            { capacity: rail.capacity, elements: placed },
            targetModules,
          );
          if (!result.ok) {
            throw unprocessable(
              'capacity_below_content',
              `La rangée ${rail.index + 1} contient des éléments jusqu'au module ${minRowCapacity({
                capacity: rail.capacity,
                elements: placed,
              })}`,
              {
                rowIndex: rail.index,
                minimum: minRowCapacity({ capacity: rail.capacity, elements: placed }),
              },
            );
          }
          await tx
            .update(boardRows)
            .set({ capacity: targetModules, updatedBy: request.userId })
            .where(eq(boardRows.id, rail.id));
        }
      }

      // Rangées ajoutées.
      if (targetRows > rails.filter((r) => r.index < targetRows).length) {
        const existing = rails.filter((r) => r.index < targetRows).length;
        await tx.insert(boardRows).values(
          Array.from({ length: targetRows - existing }, (_, k) => ({
            boardId: id,
            index: existing + k,
            capacity: targetModules,
            updatedBy: request.userId,
          })),
        );
      }

      const [updated] = await tx
        .update(boards)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.photoId !== undefined ? { photoId: input.photoId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          rows: targetRows,
          modulesPerRow: targetModules,
          updatedBy: request.userId,
        })
        .where(eq(boards.id, id))
        .returning();
      return loadBoard(tx, updated!);
    });
  });

  // --- Duplication ---------------------------------------------------------------------------------------
  app.post('/api/boards/:id/duplicate', async (request, reply) => {
    const input = parseBody(duplicateBoardSchema, request.body);
    const { board, role } = await boardAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');

    const copy = await db.transaction(async (tx) => {
      const { rails, byRow } = await loadRails(tx, board.id);
      const suffix = ' (copie)';
      const copyName =
        input.name ?? board.name.slice(0, LIMITS.maxNameLength - suffix.length) + suffix;
      const [created] = await tx
        .insert(boards)
        .values({
          propertyId: board.propertyId,
          name: copyName,
          location: board.location,
          // Photos non copiées : elles décrivent le tableau d'origine.
          photoId: null,
          rows: board.rows,
          modulesPerRow: board.modulesPerRow,
          notes: board.notes,
          ...(await centerSpot(tx, board.propertyId, request.userId)),
          updatedBy: request.userId,
        })
        .returning();

      const newRails = rails.length
        ? await tx
            .insert(boardRows)
            .values(
              rails.map((r) => ({
                boardId: created!.id,
                index: r.index,
                capacity: r.capacity,
                updatedBy: request.userId,
              })),
            )
            .returning()
        : [];
      const railByIndex = new Map(newRails.map((r) => [r.index, r.id]));

      // 1) éléments sans différentiel amont, 2) rattachement une fois les nouveaux identifiants connus.
      const copied = new Map<string, string>();
      for (const rail of rails) {
        const source = byRow.get(rail.id) ?? [];
        if (source.length === 0) continue;
        const inserted = await tx
          .insert(elements)
          .values(
            source.map((e) => ({
              rowId: railByIndex.get(rail.index)!,
              position: e.position,
              width: e.width,
              kind: e.kind,
              label: e.label,
              role: e.role,
              brand: e.brand,
              model: e.model,
              notes: e.notes,
              outgoingCables: e.outgoingCables,
              cableSection: e.cableSection,
              ratingA: e.ratingA,
              poles: e.poles,
              curve: e.curve,
              sensitivityMa: e.sensitivityMa,
              rcdType: e.rcdType,
              updatedBy: request.userId,
            })),
          )
          .returning({ id: elements.id });
        source.forEach((e, i) => copied.set(e.id, inserted[i]!.id));
      }
      for (const rail of rails) {
        for (const e of byRow.get(rail.id) ?? []) {
          if (!e.protectedByRcdId) continue;
          const target = copied.get(e.protectedByRcdId);
          if (!target) continue;
          await tx
            .update(elements)
            .set({ protectedByRcdId: target })
            .where(eq(elements.id, copied.get(e.id)!));
        }
      }
      return loadBoard(tx, created!);
    });
    return reply.code(201).send(copy);
  });

  // --- Impact d'une suppression : ce qui disparaît, ce qui est conservé -------------------------------
  app.get('/api/boards/:id/impact', async (request): Promise<BoardImpact> => {
    const { board } = await boardAccess(db, request.userId, idOf(request));

    const [rowStats] = await db
      .select({ rows: sql<number>`count(*)::int` })
      .from(boardRows)
      .where(eq(boardRows.boardId, board.id));
    const [elementStats] = await db
      .select({ elements: sql<number>`count(*)::int` })
      .from(elements)
      .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
      .where(eq(boardRows.boardId, board.id));
    const [fixtureStats] = await db
      .select({ fixtures: sql<number>`count(*)::int` })
      .from(fixtures)
      .innerJoin(rooms, eq(rooms.id, fixtures.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .where(eq(floors.propertyId, board.propertyId));
    const [unlinkStats] = await db
      .select({ linked: sql<number>`count(distinct ${circuits.fixtureId})::int` })
      .from(circuits)
      .innerJoin(elements, eq(elements.id, circuits.breakerId))
      .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
      .where(eq(boardRows.boardId, board.id));

    return {
      rowCount: rowStats?.rows ?? 0,
      elementCount: elementStats?.elements ?? 0,
      hasPhoto: board.photoId !== null,
      fixtureCount: fixtureStats?.fixtures ?? 0,
      fixturesToUnlink: unlinkStats?.linked ?? 0,
    };
  });

  // --- Suppression ------------------------------------------------------------------------------------------
  app.delete('/api/boards/:id', async (request, reply) => {
    const { board, role } = await boardAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    await db.delete(boards).where(eq(boards.id, board.id));
    return reply.code(204).send();
  });
}
