import { createDb } from '../client';
import { seedDemo } from '../seed';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL est requis');

const { db, close } = createDb(url);
try {
  const created = await seedDemo(db);
  console.log(created ? 'Données de démonstration créées.' : 'Base non vide : rien à faire.');
} finally {
  await close();
}
