import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDb, runMigrations, type Database } from './client';

/**
 * Connexion d'administration : par défaut le PostgreSQL de `docker compose up -d`.
 * Chaque appel de `createTestDatabase` crée une base jetable, migrée, puis supprimée.
 */
const adminUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://tableau:tableau@localhost:6010/postgres';

export interface TestDatabase {
  db: Database;
  pool: pg.Pool;
  drop: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `tc_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `PostgreSQL injoignable (${adminUrl}). Lancez \`docker compose up -d\` ou définissez TEST_DATABASE_URL.`,
      { cause: error },
    );
  }
  await admin.query(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { db, pool, close } = createDb(url.toString());
  await runMigrations(db);

  return {
    db,
    pool,
    drop: async () => {
      await close();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

/** Code SQLSTATE d'une erreur PostgreSQL, éventuellement enveloppée par Drizzle. */
export function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}
