import { createDb, defaultMigrationsFolder, runMigrations, sql } from '@tableau-clair/db';
import { createAnthropicAnalyzer } from './ai/analyzer';
import { createQuotaService } from './ai/quota';
import { buildApp } from './app';
import { createAuth } from './auth/auth';
import { toWebHeaders } from './auth/routes';
import { loadConfig } from './config';
import { createSmtpMailer } from './mailer';
import { createS3Storage } from './storage/object-storage';

const port = Number(process.env.PORT ?? 6001);
const host = process.env.HOST ?? '0.0.0.0';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL est requis');
  process.exit(1);
}

const config = (() => {
  try {
    return loadConfig();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
})();

const { db, close } = createDb(databaseUrl);

try {
  // Instance unique : les migrations sont appliquées au démarrage.
  await runMigrations(db, process.env.MIGRATIONS_DIR ?? defaultMigrationsFolder);

  // Le logger Fastify est créé par buildApp : on route les refus vers la console structurée.
  const auth = createAuth({
    db,
    mailer: createSmtpMailer(config.smtp),
    logger: {
      warn: (details, message) =>
        console.warn(JSON.stringify({ level: 'warn', message, ...details })),
    },
    appUrl: config.appUrl,
    secret: config.authSecret,
    allowedEmails: () => config.allowedEmails,
    google: config.google,
  });

  const app = buildApp({
    webDist: process.env.WEB_DIST,
    checkDatabase: () => db.execute(sql`select 1`),
    auth: { instance: auth, appUrl: config.appUrl },
    api: {
      db,
      storage: createS3Storage(config.s3),
      ai: {
        quota: createQuotaService(db, { limit: config.ai?.dailyLimit ?? 3 }),
        analyzer: config.ai ? createAnthropicAnalyzer(config.ai) : undefined,
      },
      resolveUserId: async (request) =>
        (await auth.api.getSession({ headers: toWebHeaders(request) }))?.user.id ?? null,
    },
  });
  app.addHook('onClose', async () => close());
  await app.listen({ port, host });
} catch (error) {
  console.error(error);
  await close();
  process.exit(1);
}
