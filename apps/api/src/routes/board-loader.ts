import type { Board } from '@tableau-clair/contracts';
import { asc, boardRows, boards, elements, eq, inArray, type DbExecutor } from '@tableau-clair/db';
import { toBoard, toRow } from './serialize';

type BoardRow = typeof boards.$inferSelect;
type ElementRow = typeof elements.$inferSelect;

/** Rangées d'un tableau avec leurs éléments, groupés par rangée. */
export async function loadRails(db: DbExecutor, boardId: string) {
  const rails = await db
    .select()
    .from(boardRows)
    .where(eq(boardRows.boardId, boardId))
    .orderBy(asc(boardRows.index));
  const items =
    rails.length === 0
      ? []
      : await db
          .select()
          .from(elements)
          .where(
            inArray(
              elements.rowId,
              rails.map((r) => r.id),
            ),
          );
  const byRow = new Map<string, ElementRow[]>();
  for (const item of items) byRow.set(item.rowId, [...(byRow.get(item.rowId) ?? []), item]);
  return { rails, byRow };
}

/** Tableau complet : géométrie, rangées, éléments. */
export async function loadBoard(db: DbExecutor, board: BoardRow): Promise<Board> {
  const { rails, byRow } = await loadRails(db, board.id);
  return toBoard(
    board,
    rails.map((r) => toRow(r, byRow.get(r.id) ?? [])),
  );
}
