import { SEARCH_LIMITS, type Overview, type SearchResult } from '@tableau-clair/contracts';
import {
  and,
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
} from '@tableau-clair/db';
import { reliability } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { parseId, propertyAccess } from './access';

const idOf = (request: { params: unknown }) => parseId((request.params as { id?: string }).id);

/** `%`, `_` et `\` perdent leur sens de jokers : on cherche le texte tel que saisi. */
function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const ci = (column: Parameters<typeof sql>[1], pattern: string) =>
  sql`unaccent(${column}) ILIKE unaccent(${pattern})`;

export function registerOverviewRoutes(app: FastifyInstance, db: Database) {
  // --- Vue d'ensemble : tableaux, fiabilité du repérage, dernière modification ----------------------
  app.get('/api/properties/:id/overview', async (request): Promise<Overview> => {
    const propertyId = idOf(request);
    await propertyAccess(db, request.userId, propertyId);

    const [boardRows_, fixtureRows] = await Promise.all([
      db.select({ id: boards.id }).from(boards).where(eq(boards.propertyId, propertyId)),
      db
        .select({ id: fixtures.id })
        .from(fixtures)
        .innerJoin(rooms, eq(rooms.id, fixtures.roomId))
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .where(eq(floors.propertyId, propertyId)),
    ]);

    const fixtureIds = fixtureRows.map((f) => f.id);
    const links = fixtureIds.length
      ? await db
          .select({
            fixtureId: circuits.fixtureId,
            breakerId: circuits.breakerId,
            status: circuits.status,
          })
          .from(circuits)
          .where(inArray(circuits.fixtureId, fixtureIds))
      : [];

    // Dernière modification, toutes tables du logement confondues.
    const latest = await db.execute<{ updated_at: Date; updated_by: string | null }>(sql`
      SELECT updated_at, updated_by FROM (
        SELECT updated_at, updated_by FROM properties WHERE id = ${propertyId}
        UNION ALL SELECT updated_at, updated_by FROM boards WHERE property_id = ${propertyId}
        UNION ALL SELECT r.updated_at, r.updated_by FROM board_rows r
          JOIN boards b ON b.id = r.board_id WHERE b.property_id = ${propertyId}
        UNION ALL SELECT e.updated_at, e.updated_by FROM elements e
          JOIN board_rows r ON r.id = e.row_id JOIN boards b ON b.id = r.board_id
          WHERE b.property_id = ${propertyId}
        UNION ALL SELECT updated_at, updated_by FROM floors WHERE property_id = ${propertyId}
        UNION ALL SELECT ro.updated_at, ro.updated_by FROM rooms ro
          JOIN floors f ON f.id = ro.floor_id WHERE f.property_id = ${propertyId}
        UNION ALL SELECT fx.updated_at, fx.updated_by FROM fixtures fx
          JOIN rooms ro ON ro.id = fx.room_id JOIN floors f ON f.id = ro.floor_id
          WHERE f.property_id = ${propertyId}
        UNION ALL SELECT c.updated_at, c.updated_by FROM circuits c
          JOIN fixtures fx ON fx.id = c.fixture_id JOIN rooms ro ON ro.id = fx.room_id
          JOIN floors f ON f.id = ro.floor_id WHERE f.property_id = ${propertyId}
      ) changes
      ORDER BY updated_at DESC LIMIT 1
    `);
    const last = latest.rows[0];

    let by: string | null = null;
    if (last?.updated_by) {
      const [user] = await db
        .select({ name: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, last.updated_by))
        .limit(1);
      by = user?.name || user?.email || null;
    }

    return {
      boardCount: boardRows_.length,
      reliability: reliability(fixtureIds, links),
      lastModified: last ? { at: new Date(last.updated_at).toISOString(), by } : null,
    };
  });

  // --- Recherche : tableaux, appareils, pièces, équipements du plan -------------------------------------
  app.get('/api/properties/:id/search', async (request): Promise<SearchResult[]> => {
    const propertyId = idOf(request);
    await propertyAccess(db, request.userId, propertyId);

    const raw = String((request.query as { q?: unknown }).q ?? '')
      .trim()
      .slice(0, SEARCH_LIMITS.maxLength);
    if (raw.length < SEARCH_LIMITS.minLength) return [];
    const pattern = likePattern(raw);
    const limit = SEARCH_LIMITS.maxResults;

    const [boardHits, elementHits, roomHits, fixtureHits] = await Promise.all([
      db
        .select({ id: boards.id, name: boards.name, location: boards.location })
        .from(boards)
        .where(
          and(
            eq(boards.propertyId, propertyId),
            sql`(${ci(boards.name, pattern)} OR ${ci(boards.location, pattern)})`,
          ),
        )
        .limit(limit),

      db
        .select({
          id: elements.id,
          label: elements.label,
          brand: elements.brand,
          model: elements.model,
          position: elements.position,
          boardId: boards.id,
          boardName: boards.name,
          rowIndex: boardRows.index,
        })
        .from(elements)
        .innerJoin(boardRows, eq(boardRows.id, elements.rowId))
        .innerJoin(boards, eq(boards.id, boardRows.boardId))
        .where(
          and(
            eq(boards.propertyId, propertyId),
            sql`(${ci(elements.label, pattern)} OR ${ci(elements.role, pattern)}
              OR ${ci(elements.brand, pattern)} OR ${ci(elements.model, pattern)})`,
          ),
        )
        .limit(limit),

      db
        .select({ id: rooms.id, name: rooms.name, floorName: floors.name })
        .from(rooms)
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .where(and(eq(floors.propertyId, propertyId), ci(rooms.name, pattern)))
        .limit(limit),

      db
        .select({
          id: fixtures.id,
          label: fixtures.label,
          roomName: rooms.name,
          floorName: floors.name,
          status: circuits.status,
          breakerId: elements.id,
          breakerLabel: elements.label,
          breakerPosition: elements.position,
          boardId: boards.id,
          boardName: boards.name,
          rowIndex: boardRows.index,
        })
        .from(fixtures)
        .innerJoin(rooms, eq(rooms.id, fixtures.roomId))
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .leftJoin(circuits, eq(circuits.fixtureId, fixtures.id))
        .leftJoin(elements, eq(elements.id, circuits.breakerId))
        .leftJoin(boardRows, eq(boardRows.id, elements.rowId))
        .leftJoin(boards, eq(boards.id, boardRows.boardId))
        .where(
          and(
            eq(floors.propertyId, propertyId),
            sql`(${ci(fixtures.label, pattern)} OR ${ci(rooms.name, pattern)})`,
          ),
        )
        .limit(limit),
    ]);

    const results: SearchResult[] = [
      ...boardHits.map((b): SearchResult => ({
        kind: 'board',
        id: b.id,
        title: b.name,
        subtitle: b.location ?? 'Tableau électrique',
        boardId: b.id,
        breaker: null,
        status: null,
      })),
      ...elementHits.map((e): SearchResult => ({
        kind: 'element',
        id: e.id,
        title: e.label,
        subtitle: [
          `${e.boardName} · Rangée ${e.rowIndex + 1} · module ${e.position + 1}`,
          [e.brand, e.model].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(' · '),
        boardId: e.boardId,
        breaker: null,
        status: null,
      })),
      ...roomHits.map((r): SearchResult => ({
        kind: 'room',
        id: r.id,
        title: r.name,
        subtitle: r.floorName,
        boardId: null,
        breaker: null,
        status: null,
      })),
      ...fixtureHits.map((f): SearchResult => ({
        kind: 'fixture',
        id: f.id,
        title: f.label,
        subtitle: `${f.roomName} · ${f.floorName}`,
        boardId: f.boardId,
        breaker:
          f.breakerId && f.boardId && f.boardName && f.rowIndex !== null
            ? {
                id: f.breakerId,
                label: f.breakerLabel!,
                boardId: f.boardId,
                boardName: f.boardName,
                rowIndex: f.rowIndex,
                position: f.breakerPosition!,
              }
            : null,
        status: f.breakerId ? (f.status ?? 'unknown') : 'unknown',
      })),
    ];

    return results.slice(0, limit);
  });
}
