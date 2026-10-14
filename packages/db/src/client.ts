import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  // Sans écouteur, la coupure d'une connexion inactive (redémarrage de la base) ferait tomber le processus.
  pool.on('error', (error) =>
    console.error('Connexion PostgreSQL inactive perdue :', error.message),
  );
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDb>['db'];

/** Dossier des migrations SQL versionnées. */
export const defaultMigrationsFolder = new URL('../drizzle', import.meta.url).pathname;

export async function runMigrations(db: Database, migrationsFolder = defaultMigrationsFolder) {
  await migrate(db, { migrationsFolder });
}

/** Transaction ouverte par `db.transaction(...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Connexion ou transaction : les requêtes s'écrivent de la même façon sur les deux. */
export type DbExecutor = Database | Transaction;
