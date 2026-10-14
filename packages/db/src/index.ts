export * from './client';
export * as schema from './schema';
export * from './schema';
export { seedDemo } from './seed';
// Opérateurs réexportés : l'API s'appuie sur la même instance de drizzle-orm que le schéma.
export { and, eq, sql } from 'drizzle-orm';
