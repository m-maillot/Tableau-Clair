import type { Board } from '@tableau-clair/contracts';
import { schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import type { Role } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createTestBucket, type TestBucket } from '../storage/testing';

/** Base, stockage et application jetables pour les tests d'intégration des routes métier. */
export async function createHarness() {
  const database: TestDatabase = await createTestDatabase();
  const bucket: TestBucket = await createTestBucket();
  const db: Database = database.db;
  const app: FastifyInstance = buildApp({
    api: {
      db,
      storage: bucket.storage,
      // Identité simulée : l'authentification réelle est couverte par auth.test.ts.
      resolveUserId: async (request) => {
        const header = request.headers['x-user-id'];
        return typeof header === 'string' ? header : null;
      },
    },
  });

  async function createUser(displayName?: string) {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `${crypto.randomUUID()}@test.local`, displayName: displayName ?? null })
      .returning();
    return user!.id;
  }

  async function call(
    userId: string | null,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload: payload as object } : {}),
      headers: userId ? { 'x-user-id': userId } : {},
    });
    return {
      status: response.statusCode,
      body: response.body ? JSON.parse(response.body) : undefined,
    };
  }

  /** Logement + un tableau (2 rangées × 24 modules) possédés par un nouvel utilisateur. */
  async function scenario(displayName?: string) {
    const owner = await createUser(displayName);
    const property = (await call(owner, 'POST', '/api/properties', { name: 'Maison' })).body;
    const board: Board = (
      await call(owner, 'POST', `/api/properties/${property.id}/boards`, {
        name: 'Tableau principal',
        rowCount: 2,
        modulesPerRow: 24,
      })
    ).body;
    return { owner, property, board, rows: board.rows };
  }

  async function addMember(propertyId: string, role: Role) {
    const userId = await createUser();
    await db.insert(schema.memberships).values({ propertyId, userId, role });
    return userId;
  }

  return {
    db,
    app,
    pool: database.pool,
    createUser,
    call,
    scenario,
    addMember,
    drop: async () => {
      await bucket.drop();
      await database.drop();
    },
  };
}
