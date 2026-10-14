import { eq, schema, type Database } from '@tableau-clair/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import type { Mailer } from '../mailer';
import { isEmailAllowed, normalizeEmail } from './allowlist';
import { createRateLimiter } from './rate-limit';

export interface AuthLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export interface AuthOptions {
  db: Database;
  mailer: Mailer;
  logger: AuthLogger;
  appUrl: string;
  secret: string;
  /** Lue à chaque contrôle : la liste peut changer sans recréer l'instance. */
  allowedEmails: () => ReadonlySet<string>;
  google?: { clientId: string; clientSecret: string } | undefined;
  /** Durée de validité du lien magique, en secondes. */
  magicLinkTtlSeconds?: number;
  /** Plafond de liens magiques par adresse sur 10 minutes. */
  magicLinkPerEmail?: number;
}

const REFUSED = { error: 'access_denied', errorDescription: 'Accès refusé' } as const;

/**
 * Authentification sans mot de passe : lien magique et Google (Apple en V1.1).
 * Inscriptions fermées : seules les adresses de la liste obtiennent un compte ou une session,
 * quel que soit le fournisseur.
 */
export function createAuth(options: AuthOptions) {
  const { db, logger } = options;
  const isHttps = options.appUrl.startsWith('https://');
  const perEmail = createRateLimiter({
    max: options.magicLinkPerEmail ?? 3,
    windowMs: 10 * 60_000,
  });

  const allowed = (email: string | null | undefined) =>
    isEmailAllowed(options.allowedEmails(), email);

  return betterAuth({
    appName: 'Tableau Clair',
    baseURL: options.appUrl,
    secret: options.secret,
    trustedOrigins: [options.appUrl],
    database: drizzleAdapter(db, {
      provider: 'pg',
      // Les clés sont les `modelName` déclarés plus bas (noms de tables au pluriel).
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    user: {
      modelName: 'users',
      fields: { name: 'displayName' },
      // Création, liaison de compte et reconnexion OAuth : tout passe par la liste.
      validateUserInfo: ({ user, source }) => {
        const email = typeof user.email === 'string' ? user.email : null;
        if (allowed(email)) return;
        logger.warn(
          { email, action: source.action, method: source.method },
          'Connexion refusée : adresse hors liste',
        );
        return REFUSED;
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    advanced: {
      database: { generateId: 'uuid' },
      // Explicite : Better Auth désactive ces contrôles par défaut quand NODE_ENV=test.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: isHttps,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isHttps },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/magic-link': { window: 60, max: 5 },
        '/magic-link/verify': { window: 60, max: 10 },
        '/sign-in/social': { window: 60, max: 10 },
      },
    },
    socialProviders: options.google
      ? {
          google: {
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
          },
        }
      : {},
    databaseHooks: {
      session: {
        create: {
          // Couvre les reconnexions par lien magique d'un compte déjà existant :
          // retirer une adresse de la liste coupe aussi ses futures sessions.
          before: async (session) => {
            const [user] = await db
              .select({ email: schema.users.email })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId))
              .limit(1);
            if (allowed(user?.email)) return;
            logger.warn({ email: user?.email }, 'Session refusée : adresse hors liste');
            return false;
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: options.magicLinkTtlSeconds ?? 5 * 60,
        // Jeton stocké haché : une fuite de la base ne donne pas de liens utilisables.
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          // Réponse neutre : le client reçoit toujours « envoyé », que l'adresse soit admise ou non.
          if (!allowed(email)) {
            logger.warn({ email }, 'Lien magique non envoyé : adresse hors liste');
            return;
          }
          if (!perEmail.take(normalizeEmail(email))) {
            logger.warn({ email }, 'Lien magique non envoyé : trop de demandes pour cette adresse');
            return;
          }
          await options.mailer.send({
            to: email,
            subject: 'Votre lien de connexion à Tableau Clair',
            text: [
              'Bonjour,',
              '',
              'Voici votre lien de connexion à Tableau Clair (valable quelques minutes, usage unique) :',
              url,
              '',
              "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
            ].join('\n'),
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
