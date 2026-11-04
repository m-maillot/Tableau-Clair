import { schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpError } from '../http';
import { createQuotaService, PENDING_TTL_MS, type QuotaService } from './quota';

let t: TestDatabase;
let db: Database;
let clock = new Date('2026-10-27T10:00:00Z');

let service: QuotaService;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  service = createQuotaService(db, { limit: 3, now: () => clock });
});
afterAll(() => t.drop());

async function createUser() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${crypto.randomUUID()}@test.local` })
    .returning();
  return user!.id;
}

/** Réserve puis termine l'analyse, comme le ferait l'endpoint. */
async function analyse(userId: string) {
  const reservation = await service.reserve(userId, null, 'test-model');
  await service.succeed(reservation.id, { inputTokens: 10, outputTokens: 5, elementCount: 1 });
  return reservation;
}

const failure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
};

describe('quota d’analyses', () => {
  it('accepte 3 analyses par jour puis refuse la 4ᵉ avec l’heure de remise à zéro', async () => {
    const user = await createUser();
    for (let i = 0; i < 3; i++) await analyse(user);

    const error = await failure(service.reserve(user, null, 'test-model'));
    expect(error.status).toBe(429);
    expect(error.code).toBe('quota_exceeded');
    expect(error.details).toMatchObject({ used: 3, remaining: 0, limit: 3 });
    // 27 octobre 2026 : heure d'hiver (UTC+1), prochain minuit à 23:00 UTC.
    expect(await service.status(user)).toMatchObject({
      enabled: true,
      used: 3,
      remaining: 0,
      resetsAt: '2026-10-27T23:00:00.000Z',
    });
  });

  it('le plafond est propre à chaque utilisateur', async () => {
    const [a, b] = [await createUser(), await createUser()];
    for (let i = 0; i < 3; i++) await analyse(a);
    expect((await service.reserve(b, null, 'test-model')).quota.remaining).toBe(2);
  });

  it('restitue l’analyse en cas d’échec technique', async () => {
    const user = await createUser();
    const reservation = await service.reserve(user, null, 'test-model');
    expect((await service.status(user)).used).toBe(1);
    await service.fail(reservation.id);
    expect((await service.status(user)).used).toBe(0);
  });

  it('refuse une seconde analyse pendant qu’une autre est en cours', async () => {
    const user = await createUser();
    await service.reserve(user, null, 'test-model');
    const error = await failure(service.reserve(user, null, 'test-model'));
    expect(error.status).toBe(409);
    expect(error.code).toBe('analysis_in_progress');
  });

  it('5 demandes simultanées : exactement 3 acceptées', async () => {
    const user = await createUser();
    // Chaque demande termine tout de suite son analyse pour ne pas être refusée comme « en cours ».
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, async () => {
        const reservation = await service.reserve(user, null, 'test-model');
        await service.succeed(reservation.id, {
          inputTokens: null,
          outputTokens: null,
          elementCount: 0,
        });
      }),
    );
    const accepted = outcomes.filter((o) => o.status === 'fulfilled').length;
    expect(accepted).toBeLessThanOrEqual(3);
    expect((await service.status(user)).used).toBe(accepted);
    expect(accepted).toBeGreaterThanOrEqual(1);
  });

  it('5 demandes simultanées sans terminer : une seule passe, les autres sont en cours', async () => {
    const user = await createUser();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.reserve(user, null, 'test-model')),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect((await service.status(user)).used).toBe(1);
  });

  it('ignore une analyse en cours périmée', async () => {
    const user = await createUser();
    await service.reserve(user, null, 'test-model');
    const before = clock;
    clock = new Date(clock.getTime() + PENDING_TTL_MS + 1000);
    try {
      expect(await service.status(user)).toMatchObject({ used: 0, remaining: 3 });
      await expect(service.reserve(user, null, 'test-model')).resolves.toBeDefined();
    } finally {
      clock = before;
    }
  });

  it('repart de zéro le lendemain, à minuit heure de Paris', async () => {
    const user = await createUser();
    const before = clock;
    try {
      clock = new Date('2026-10-27T21:30:00Z'); // 22:30 à Paris
      for (let i = 0; i < 3; i++) await analyse(user);
      expect((await service.status(user)).remaining).toBe(0);

      clock = new Date('2026-10-27T22:59:00Z'); // 23:59 à Paris : même jour
      expect((await service.status(user)).remaining).toBe(0);

      clock = new Date('2026-10-27T23:01:00Z'); // 00:01 à Paris : nouveau jour
      expect((await service.status(user)).remaining).toBe(3);
    } finally {
      clock = before;
    }
  });

  it('suit le passage à l’heure d’hiver pour l’heure de remise à zéro', async () => {
    const user = await createUser();
    const before = clock;
    try {
      clock = new Date('2026-10-24T10:00:00Z'); // heure d'été (UTC+2)
      expect((await service.status(user)).resetsAt).toBe('2026-10-24T22:00:00.000Z');
      clock = new Date('2026-10-25T10:00:00Z'); // jour du changement d'heure, journée de 25 h
      expect((await service.status(user)).resetsAt).toBe('2026-10-25T23:00:00.000Z');
    } finally {
      clock = before;
    }
  });
});
