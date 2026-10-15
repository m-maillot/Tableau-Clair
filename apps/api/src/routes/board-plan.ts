import { and, asc, boards, eq, floors, isNull, sql, type DbExecutor } from '@tableau-clair/db';
import { FLOOR_DEFAULTS } from '@tableau-clair/contracts';

/** Décalage entre deux tableaux posés au même endroit, pour qu'on les distingue sur le plan. */
const STACK_OFFSET = 40;

/** Premier étage du logement ; il est créé au besoin, un tableau devant toujours avoir où se poser. */
async function firstFloor(db: DbExecutor, propertyId: string, userId: string | null) {
  const [existing] = await db
    .select()
    .from(floors)
    .where(eq(floors.propertyId, propertyId))
    .orderBy(asc(floors.index))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(floors)
    .values({
      propertyId,
      name: 'Rez-de-chaussée',
      index: 0,
      width: FLOOR_DEFAULTS.width,
      height: FLOOR_DEFAULTS.height,
      updatedBy: userId,
    })
    .returning();
  return created!;
}

/**
 * Emplacement « en plein milieu » du plan (premier étage) pour un nouveau tableau ; l'utilisateur le
 * place ensuite où il veut. Plusieurs tableaux posés d'affilée sont légèrement décalés.
 */
export async function centerSpot(db: DbExecutor, propertyId: string, userId: string | null) {
  const floor = await firstFloor(db, propertyId, userId);
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(boards)
    .where(and(eq(boards.planFloorId, floor.id)));
  const shift = (count % 8) * STACK_OFFSET;
  return {
    planFloorId: floor.id,
    planX: Math.round(floor.width / 2 + shift),
    planY: Math.round(floor.height / 2 + shift),
  };
}

/** Pose un tableau existant au centre (pour ceux qui n'ont pas d'emplacement). */
export async function placeBoardAtCenter(
  db: DbExecutor,
  boardId: string,
  propertyId: string,
  userId: string | null,
) {
  await db
    .update(boards)
    .set(await centerSpot(db, propertyId, userId))
    .where(eq(boards.id, boardId));
}

/** Pose les tableaux existants qui n'ont pas encore d'emplacement (créés avant cette règle). */
export async function placeUnplacedBoards(
  db: DbExecutor,
  propertyId: string,
  userId: string | null,
) {
  const unplaced = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.propertyId, propertyId), isNull(boards.planFloorId)));
  for (const board of unplaced) await placeBoardAtCenter(db, board.id, propertyId, userId);
}
