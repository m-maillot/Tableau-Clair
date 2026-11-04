import {
  bulkCreateElementsSchema,
  createElementSchema,
  updateElementSchema,
  updateRowSchema,
  type CreateElementInput,
  type UpdateElementInput,
} from '@tableau-clair/contracts';
import {
  and,
  boardRows,
  elements,
  eq,
  inArray,
  type Database,
  type DbExecutor,
} from '@tableau-clair/db';
import { setRowCapacity, validateSpan, type PlacementError } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { conflict, notFound, parseBody, unprocessable } from '../http';
import { boardAccess, elementAccess, parseId, requireRole, rowAccess } from './access';
import { assertPhotoInProperty } from './boards';
import { linkedCounts } from './board-loader';
import { toElement, toRow } from './serialize';

const idOf = (request: { params: unknown }, key = 'id') =>
  parseId((request.params as Record<string, string | undefined>)[key]);

type ElementRow = typeof elements.$inferSelect;

const PLACEMENT_MESSAGES: Record<PlacementError['code'], string> = {
  invalid_width: 'La largeur doit être un nombre entier de modules, au moins 1',
  invalid_position: 'La position doit être un nombre entier de modules, au moins 0',
  out_of_bounds: 'L’élément dépasse la capacité de la rangée',
  overlap: 'L’emplacement est déjà occupé par un autre élément',
  not_found: 'Élément introuvable',
  duplicate_id: 'Identifiant déjà utilisé',
};

function placementProblem(error: PlacementError) {
  return unprocessable(error.code, PLACEMENT_MESSAGES[error.code], error);
}

/** Verrouille des rangées dans un ordre stable pour éviter les interblocages. */
async function lockRows(tx: DbExecutor, rowIds: string[]) {
  const ids = [...new Set(rowIds)].sort();
  await tx
    .select({ id: boardRows.id })
    .from(boardRows)
    .where(inArray(boardRows.id, ids))
    .orderBy(boardRows.id)
    .for('update');
}

const placed = (rows: ElementRow[]) =>
  rows.map((e) => ({ id: e.id, position: e.position, width: e.width }));

/** Le différentiel amont doit être un différentiel du même tableau. */
async function assertRcdInBoard(tx: DbExecutor, rcdId: string | null | undefined, boardId: string) {
  if (!rcdId) return;
  const [row] = await tx
    .select({ id: elements.id })
    .from(elements)
    .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
    .where(and(eq(elements.id, rcdId), eq(boardRows.boardId, boardId), eq(elements.kind, 'rcd')))
    .limit(1);
  if (!row) {
    throw unprocessable(
      'rcd_not_found',
      'Le différentiel amont doit être un différentiel de ce tableau',
    );
  }
}

/** Champs modifiables communs à la création et à la modification. */
function editableValues(input: Partial<CreateElementInput> & Partial<UpdateElementInput>) {
  const v: Partial<typeof elements.$inferInsert> = {};
  const copy = <K extends keyof typeof v>(key: K, value: (typeof v)[K] | undefined) => {
    if (value !== undefined) v[key] = value;
  };
  copy('kind', input.kind);
  copy('position', input.position);
  copy('width', input.width);
  copy('label', input.label);
  copy('role', input.role);
  copy('brand', input.brand);
  copy('model', input.model);
  copy('notes', input.notes);
  copy('photoId', input.photoId);
  copy('outgoingCables', input.outgoingCables);
  if (input.cableSection !== undefined) {
    v.cableSection = input.cableSection === null ? null : String(input.cableSection);
  }
  copy('ratingA', input.ratingA);
  copy('poles', input.poles);
  copy('curve', input.curve);
  copy('sensitivityMa', input.sensitivityMa);
  copy('rcdType', input.rcdType);
  copy('protectedByRcdId', input.protectedByRcdId);
  return v;
}

export function registerElementRoutes(app: FastifyInstance, db: Database) {
  // --- Rangée : capacité -------------------------------------------------------------------------------
  app.patch('/api/rows/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updateRowSchema, request.body);

    return db.transaction(async (tx) => {
      const { role } = await rowAccess(tx, request.userId, id);
      requireRole(role, 'editor');
      await lockRows(tx, [id]);

      const [row] = await tx.select().from(boardRows).where(eq(boardRows.id, id));
      if (!row) throw notFound('Rangée');
      const items = await tx.select().from(elements).where(eq(elements.rowId, id));
      if (row.version !== input.version) throw conflict(toRow(row, items));

      const result = setRowCapacity(
        { capacity: row.capacity, elements: placed(items) },
        input.capacity,
      );
      if (!result.ok) throw placementProblem(result.error);

      const [updated] = await tx
        .update(boardRows)
        .set({ capacity: input.capacity, updatedBy: request.userId })
        .where(eq(boardRows.id, id))
        .returning();
      return toRow(updated!, items);
    });
  });

  // --- Élément : création ----------------------------------------------------------------------------------
  app.post('/api/rows/:id/elements', async (request, reply) => {
    const rowId = idOf(request);
    const input = parseBody(createElementSchema, request.body);

    const created = await db.transaction(async (tx) => {
      const { row, board, role } = await rowAccess(tx, request.userId, rowId);
      requireRole(role, 'editor');
      await lockRows(tx, [rowId]);
      await assertPhotoInProperty(tx, input.photoId, board.propertyId);
      await assertRcdInBoard(tx, input.protectedByRcdId, board.id);

      const current = await tx.select().from(elements).where(eq(elements.rowId, rowId));
      const problem = validateSpan({ capacity: row.capacity, elements: placed(current) }, input);
      if (problem) throw placementProblem(problem);

      const [element] = await tx
        .insert(elements)
        .values({
          ...(editableValues(input) as Omit<typeof elements.$inferInsert, 'rowId'>),
          rowId,
          position: input.position,
          width: input.width,
          kind: input.kind,
          label: input.label,
          updatedBy: request.userId,
        })
        .returning();
      return element!;
    });
    return reply.code(201).send(toElement(created));
  });

  // --- Éléments : création en lot -----------------------------------------------------------------------------
  // Tout ou rien. Indépendant de l'IA : sert à valider une proposition d'analyse de photo, mais pas
  // seulement (docs/SPEC-import-photo.md §6).
  app.post('/api/boards/:id/elements/bulk', async (request, reply) => {
    const boardId = idOf(request);
    const input = parseBody(bulkCreateElementsSchema, request.body);

    const created = await db.transaction(async (tx) => {
      const { board, role } = await boardAccess(tx, request.userId, boardId);
      requireRole(role, 'editor');

      const rails = await tx.select().from(boardRows).where(eq(boardRows.boardId, board.id));
      const railByIndex = new Map(rails.map((rail) => [rail.index, rail]));
      await lockRows(
        tx,
        rails.map((rail) => rail.id),
      );

      const photoIds = new Set(input.elements.flatMap((e) => (e.photoId ? [e.photoId] : [])));
      for (const photoId of photoIds) await assertPhotoInProperty(tx, photoId, board.propertyId);
      const rcdIds = new Set(
        input.elements.flatMap((e) => (e.protectedByRcdId ? [e.protectedByRcdId] : [])),
      );
      for (const rcdId of rcdIds) await assertRcdInBoard(tx, rcdId, board.id);

      // État de chaque rangée, enrichi au fil des ajouts : un élément est validé contre les précédents du lot.
      const current = rails.length
        ? await tx
            .select()
            .from(elements)
            .where(
              inArray(
                elements.rowId,
                rails.map((rail) => rail.id),
              ),
            )
        : [];
      const state = new Map(
        rails.map((rail) => [rail.id, placed(current.filter((e) => e.rowId === rail.id))]),
      );

      const inserted: ElementRow[] = [];
      for (const [index, item] of input.elements.entries()) {
        const rail = railByIndex.get(item.rowIndex);
        if (!rail) {
          throw unprocessable('row_not_found', 'Rangée introuvable dans ce tableau', { index });
        }
        const siblings = state.get(rail.id)!;
        const problem = validateSpan({ capacity: rail.capacity, elements: siblings }, item);
        if (problem) {
          throw unprocessable(problem.code, PLACEMENT_MESSAGES[problem.code], {
            ...problem,
            index,
          });
        }

        const [element] = await tx
          .insert(elements)
          .values({
            ...(editableValues(item) as Omit<typeof elements.$inferInsert, 'rowId'>),
            rowId: rail.id,
            position: item.position,
            width: item.width,
            kind: item.kind,
            label: item.label,
            updatedBy: request.userId,
          })
          .returning();
        siblings.push({ id: element!.id, position: element!.position, width: element!.width });
        inserted.push(element!);
      }
      return inserted;
    });
    return reply.code(201).send({ elements: created.map((element) => toElement(element)) });
  });

  // --- Élément : lecture ----------------------------------------------------------------------------------------
  app.get('/api/elements/:id', async (request) => {
    const { element } = await elementAccess(db, request.userId, idOf(request));
    const linked = await linkedCounts(db, [element.id]);
    return toElement(element, linked.get(element.id) ?? 0);
  });

  // --- Élément : modification, déplacement, redimensionnement -------------------------------------
  app.patch('/api/elements/:id', async (request) => {
    const id = idOf(request);
    const input = parseBody(updateElementSchema, request.body);

    return db.transaction(async (tx) => {
      const found = await elementAccess(tx, request.userId, id);
      requireRole(found.role, 'editor');
      const targetRowId = input.rowId ?? found.row.id;

      // Verrouille la rangée d'origine et celle de destination.
      await lockRows(tx, [found.row.id, targetRowId]);

      const [current] = await tx.select().from(elements).where(eq(elements.id, id));
      if (!current) throw notFound('Élément');
      if (current.version !== input.version) throw conflict(toElement(current));

      let capacity = found.row.capacity;
      if (targetRowId !== found.row.id) {
        const target = await rowAccess(tx, request.userId, targetRowId).catch(() => {
          throw unprocessable('row_not_found', 'Rangée de destination introuvable');
        });
        if (target.board.id !== found.board.id) {
          throw unprocessable(
            'row_other_board',
            'La rangée de destination est dans un autre tableau',
          );
        }
        capacity = target.row.capacity;
      }

      await assertPhotoInProperty(tx, input.photoId, found.board.propertyId);
      await assertRcdInBoard(tx, input.protectedByRcdId, found.board.id);

      const next = {
        position: input.position ?? current.position,
        width: input.width ?? current.width,
      };
      const siblings = await tx.select().from(elements).where(eq(elements.rowId, targetRowId));
      const problem = validateSpan({ capacity, elements: placed(siblings) }, next, id);
      if (problem) throw placementProblem(problem);

      const [updated] = await tx
        .update(elements)
        .set({
          ...editableValues(input),
          rowId: targetRowId,
          position: next.position,
          width: next.width,
          updatedBy: request.userId,
        })
        .where(and(eq(elements.id, id), eq(elements.version, input.version)))
        .returning();
      if (!updated) throw conflict(toElement(current));
      const linked = await linkedCounts(tx, [updated.id]);
      return toElement(updated, linked.get(updated.id) ?? 0);
    });
  });

  // --- Élément : suppression ----------------------------------------------------------------------------------
  // Les liaisons de circuits passent à « inconnu » (clé étrangère + déclencheur de la base).
  app.delete('/api/elements/:id', async (request, reply) => {
    const { element, role } = await elementAccess(db, request.userId, idOf(request));
    requireRole(role, 'editor');
    await db.delete(elements).where(eq(elements.id, element.id));
    return reply.code(204).send();
  });
}
