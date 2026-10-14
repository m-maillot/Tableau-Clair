import type { Board, LastModified } from '@tableau-clair/contracts';
import {
  asc,
  boardRows,
  boards,
  circuits,
  elements,
  eq,
  inArray,
  schema,
  sql,
  type DbExecutor,
} from '@tableau-clair/db';
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

/** Dernière modification du tableau, de ses rangées ou de ses éléments, avec le nom de l'auteur. */
async function lastModifiedOf(db: DbExecutor, boardId: string): Promise<LastModified> {
  const latest = await db.execute<{ updated_at: Date; updated_by: string | null }>(sql`
    SELECT updated_at, updated_by FROM (
      SELECT updated_at, updated_by FROM boards WHERE id = ${boardId}
      UNION ALL SELECT updated_at, updated_by FROM board_rows WHERE board_id = ${boardId}
      UNION ALL SELECT e.updated_at, e.updated_by FROM elements e
        JOIN board_rows r ON r.id = e.row_id WHERE r.board_id = ${boardId}
    ) changes
    ORDER BY updated_at DESC LIMIT 1
  `);
  const last = latest.rows[0];
  if (!last) return null;

  let by: string | null = null;
  if (last.updated_by) {
    const [user] = await db
      .select({ name: schema.users.displayName, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, last.updated_by))
      .limit(1);
    by = user?.name || user?.email || null;
  }
  return { at: new Date(last.updated_at).toISOString(), by };
}

/** Nombre d'équipements du plan reliés à chacun des éléments donnés. */
export async function linkedCounts(
  db: DbExecutor,
  elementIds: string[],
): Promise<Map<string, number>> {
  if (elementIds.length === 0) return new Map();
  const rows = await db
    .select({ id: circuits.breakerId, count: sql<number>`count(*)::int` })
    .from(circuits)
    .where(inArray(circuits.breakerId, elementIds))
    .groupBy(circuits.breakerId);
  return new Map(rows.flatMap((r) => (r.id ? [[r.id, r.count] as const] : [])));
}

/** Tableau complet : géométrie, rangées, éléments. */
export async function loadBoard(db: DbExecutor, board: BoardRow): Promise<Board> {
  const { rails, byRow } = await loadRails(db, board.id);
  const linked = await linkedCounts(
    db,
    [...byRow.values()].flat().map((e) => e.id),
  );
  return toBoard(
    board,
    rails.map((r) => toRow(r, byRow.get(r.id) ?? [], linked)),
    await lastModifiedOf(db, board.id),
  );
}
