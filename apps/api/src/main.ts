import { createDb, defaultMigrationsFolder, runMigrations } from '@tableau-clair/db';
import { sql } from 'drizzle-orm';
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL est requis');
  process.exit(1);
}

const { db, close } = createDb(databaseUrl);

try {
  // Instance unique : les migrations sont appliquées au démarrage.
  await runMigrations(db, process.env.MIGRATIONS_DIR ?? defaultMigrationsFolder);

  const app = buildApp({
    webDist: process.env.WEB_DIST,
    checkDatabase: () => db.execute(sql`select 1`),
  });
  app.addHook('onClose', async () => close());
  await app.listen({ port, host });
} catch (error) {
  console.error(error);
  await close();
  process.exit(1);
}
