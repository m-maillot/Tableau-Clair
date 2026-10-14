import { createDb, runMigrations } from '../client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL est requis');

const { db, close } = createDb(url);
try {
  await runMigrations(db);
  console.log('Migrations appliquées.');
} finally {
  await close();
}
