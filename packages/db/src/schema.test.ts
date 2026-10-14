import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './client';
import { seedDemo } from './seed';
import {
  boardRows,
  boards,
  circuits,
  elements,
  fixtures,
  memberships,
  properties,
  rooms,
  floors,
  shareLinks,
  users,
} from './schema';
import { createTestDatabase, pgErrorCode, type TestDatabase } from './testing';

let t: TestDatabase;
let db: Database;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
});
afterAll(async () => {
  await t.drop();
});

/** Crée un logement + propriétaire + tableau + une rangée de 24 modules. */
async function createBoard() {
  const suffix = crypto.randomUUID();
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: `${suffix}@test.local` })
      .returning();
    const [property] = await tx.insert(properties).values({ name: 'Logement' }).returning();
    await tx
      .insert(memberships)
      .values({ propertyId: property!.id, userId: user!.id, role: 'owner' });
    const [board] = await tx
      .insert(boards)
      .values({ propertyId: property!.id, name: 'Tableau', rows: 2, modulesPerRow: 24 })
      .returning();
    const [row] = await tx
      .insert(boardRows)
      .values({ boardId: board!.id, index: 0, capacity: 24 })
      .returning();
    return { user: user!, property: property!, board: board!, row: row! };
  });
}

const element = (rowId: string, position: number, width = 1) => ({
  rowId,
  position,
  width,
  kind: 'breaker' as const,
  label: `E${position}`,
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `une erreur ${code} était attendue`).toBeDefined();
  expect(pgErrorCode(error)).toBe(code);
}

describe('rangées', () => {
  it('refuse deux rangées de même index dans un tableau', async () => {
    const { board } = await createBoard();
    await expectCode(
      db.insert(boardRows).values({ boardId: board.id, index: 0, capacity: 24 }),
      '23505',
    );
  });
});

describe('éléments', () => {
  it('refuse le chevauchement dans une rangée', async () => {
    const { row } = await createBoard();
    await db.insert(elements).values(element(row.id, 0, 2));
    await expectCode(db.insert(elements).values(element(row.id, 1)), '23P01');
  });

  it('accepte des éléments contigus, et le même module sur une autre rangée', async () => {
    const { row, board } = await createBoard();
    const [other] = await db
      .insert(boardRows)
      .values({ boardId: board.id, index: 1, capacity: 24 })
      .returning();
    await db.insert(elements).values([element(row.id, 0, 2), element(row.id, 2)]);
    await db.insert(elements).values(element(other!.id, 0, 2));
  });

  it('refuse une largeur nulle ou une position négative', async () => {
    const { row } = await createBoard();
    await expectCode(db.insert(elements).values(element(row.id, 0, 0)), '23514');
    await expectCode(db.insert(elements).values(element(row.id, -1)), '23514');
  });
});

describe('versionnage', () => {
  it('incrémente version et updated_at à chaque modification', async () => {
    const { property } = await createBoard();
    const [before] = await db.select().from(properties).where(eq(properties.id, property.id));
    expect(before!.version).toBe(1);

    await db.update(properties).set({ name: 'Renommé' }).where(eq(properties.id, property.id));
    const [after] = await db.select().from(properties).where(eq(properties.id, property.id));
    expect(after!.version).toBe(2);
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it("détecte un conflit : l'écriture conditionnelle sur une ancienne version ne touche aucune ligne", async () => {
    const { property } = await createBoard();
    await db.update(properties).set({ name: 'A' }).where(eq(properties.id, property.id));

    const stale = await db
      .update(properties)
      .set({ name: 'B' })
      .where(and(eq(properties.id, property.id), eq(properties.version, 1)))
      .returning();
    expect(stale).toHaveLength(0);

    const current = await db
      .update(properties)
      .set({ name: 'C' })
      .where(and(eq(properties.id, property.id), eq(properties.version, 2)))
      .returning();
    expect(current).toHaveLength(1);
    expect(current[0]!.name).toBe('C');
  });
});

describe('propriétaire minimum', () => {
  it('refuse un logement créé sans propriétaire', async () => {
    await expectCode(db.insert(properties).values({ name: 'Orphelin' }), '23514');
  });

  it('refuse de retirer le dernier propriétaire', async () => {
    const { property, user } = await createBoard();
    await expectCode(
      db
        .delete(memberships)
        .where(and(eq(memberships.propertyId, property.id), eq(memberships.userId, user.id))),
      '23514',
    );
  });

  it('refuse de rétrograder le dernier propriétaire', async () => {
    const { property } = await createBoard();
    await expectCode(
      db.update(memberships).set({ role: 'editor' }).where(eq(memberships.propertyId, property.id)),
      '23514',
    );
  });

  it('autorise le transfert de propriété dans une transaction', async () => {
    const { property, user } = await createBoard();
    const [next] = await db
      .insert(users)
      .values({ email: `${crypto.randomUUID()}@test.local` })
      .returning();
    await db.transaction(async (tx) => {
      await tx.delete(memberships).where(eq(memberships.userId, user.id));
      await tx
        .insert(memberships)
        .values({ propertyId: property.id, userId: next!.id, role: 'owner' });
    });
    const owners = await db
      .select()
      .from(memberships)
      .where(eq(memberships.propertyId, property.id));
    expect(owners.map((m) => m.userId)).toEqual([next!.id]);
  });

  it('autorise la suppression du logement entier (cascade)', async () => {
    const { property, board, row } = await createBoard();
    await db.insert(elements).values(element(row.id, 0));
    await db.delete(properties).where(eq(properties.id, property.id));
    expect(await db.select().from(boards).where(eq(boards.id, board.id))).toHaveLength(0);
    expect(await db.select().from(elements).where(eq(elements.rowId, row.id))).toHaveLength(0);
  });
});

describe('lien de consultation', () => {
  it('autorise un seul lien actif par tableau, et un nouveau après révocation', async () => {
    const { board } = await createBoard();
    const [first] = await db
      .insert(shareLinks)
      .values({ boardId: board.id, tokenHash: crypto.randomUUID() })
      .returning();
    await expectCode(
      db.insert(shareLinks).values({ boardId: board.id, tokenHash: crypto.randomUUID() }),
      '23505',
    );
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, first!.id));
    await db.insert(shareLinks).values({ boardId: board.id, tokenHash: crypto.randomUUID() });
  });
});

describe('circuits', () => {
  async function createLinkedFixture() {
    const ctx = await createBoard();
    const [breaker] = await db.insert(elements).values(element(ctx.row.id, 0)).returning();
    const [floor] = await db
      .insert(floors)
      .values({ propertyId: ctx.property.id, name: 'RDC', index: 0, width: 100, height: 100 })
      .returning();
    const [room] = await db
      .insert(rooms)
      .values({ floorId: floor!.id, name: 'Cuisine', x: 0, y: 0, w: 10, h: 10 })
      .returning();
    const [fixture] = await db
      .insert(fixtures)
      .values({ roomId: room!.id, kind: 'socket', label: 'Prise', x: 1, y: 1 })
      .returning();
    const [circuit] = await db
      .insert(circuits)
      .values({ fixtureId: fixture!.id, breakerId: breaker!.id, status: 'verified' })
      .returning();
    return { breaker: breaker!, fixture: fixture!, circuit: circuit! };
  }

  it('relie un équipement à un seul disjoncteur', async () => {
    const { fixture, breaker } = await createLinkedFixture();
    await expectCode(
      db
        .insert(circuits)
        .values({ fixtureId: fixture.id, breakerId: breaker.id, status: 'assumed' }),
      '23505',
    );
  });

  it('passe la liaison à « inconnu » quand le disjoncteur est supprimé', async () => {
    const { breaker, circuit, fixture } = await createLinkedFixture();
    await db.delete(elements).where(eq(elements.id, breaker.id));

    const [after] = await db.select().from(circuits).where(eq(circuits.id, circuit.id));
    expect(after!.breakerId).toBeNull();
    expect(after!.status).toBe('unknown');
    expect(await db.select().from(fixtures).where(eq(fixtures.id, fixture.id))).toHaveLength(1);
  });

  it('refuse une liaison sans disjoncteur qui ne soit pas « inconnue »', async () => {
    const { fixture } = await createLinkedFixture();
    const [other] = await db
      .insert(fixtures)
      .values({ roomId: fixture.roomId, kind: 'light', label: 'Lumière', x: 2, y: 2 })
      .returning();
    await expectCode(
      db.insert(circuits).values({ fixtureId: other!.id, breakerId: null, status: 'verified' }),
      '23514',
    );
  });
});

describe('données de démonstration', () => {
  it("s'insèrent sur une base vide et ne se dupliquent pas", async () => {
    const fresh = await createTestDatabase();
    try {
      expect(await seedDemo(fresh.db)).toBe(true);
      expect(await seedDemo(fresh.db)).toBe(false);
      const count = await fresh.db.select().from(circuits);
      expect(count).toHaveLength(3);
    } finally {
      await fresh.drop();
    }
  });
});
