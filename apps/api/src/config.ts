import { z } from 'zod';
import { parseAllowedEmails } from './auth/allowlist';
import type { S3Config } from './storage/object-storage';

const DEV_SECRET_MARKER = 'change-me';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET doit faire au moins 32 caractères'),
  ALLOWED_EMAILS: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export interface AppConfig {
  isProduction: boolean;
  appUrl: string;
  authSecret: string;
  allowedEmails: ReadonlySet<string>;
  google: { clientId: string; clientSecret: string } | undefined;
  smtp: { host: string; port: number; user?: string; password?: string; from: string };
  s3: S3Config;
}

/** Lit la configuration depuis l'environnement ; échoue avec un message lisible si elle est invalide. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  if (isProduction && e.AUTH_SECRET.includes(DEV_SECRET_MARKER)) {
    throw new Error('Configuration invalide : AUTH_SECRET est encore la valeur d’exemple.');
  }
  if (isProduction && !e.APP_URL.startsWith('https://')) {
    throw new Error('Configuration invalide : APP_URL doit être en https en production.');
  }
  const allowedEmails = parseAllowedEmails(e.ALLOWED_EMAILS);
  if (allowedEmails.size === 0) {
    throw new Error('Configuration invalide : ALLOWED_EMAILS ne contient aucune adresse.');
  }

  return {
    isProduction,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    authSecret: e.AUTH_SECRET,
    allowedEmails,
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
        : undefined,
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      ...(e.SMTP_USER ? { user: e.SMTP_USER } : {}),
      ...(e.SMTP_PASSWORD ? { password: e.SMTP_PASSWORD } : {}),
      from: e.MAIL_FROM,
    },
    s3: {
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
    },
  };
}
