import type { Quota } from '@tableau-clair/contracts';
import { aiAnalyses, and, eq, sql, type Database } from '@tableau-clair/db';
import { HttpError } from '../http';

/** Une analyse `pending` plus ancienne est supposée interrompue (processus arrêté) : elle ne compte plus. */
export const PENDING_TTL_MS = 5 * 60 * 1000;

export interface QuotaOptions {
  /** Analyses par utilisateur et par jour. */
  limit: number;
  /** Horloge injectable pour les tests. */
  now?: () => Date;
}

export interface Reservation {
  id: string;
  quota: Quota;
}

export interface AnalysisResult {
  inputTokens: number | null;
  outputTokens: number | null;
  elementCount: number;
}

function quotaError(status: number, code: string, message: string, quota: Quota) {
  return new HttpError(status, code, message, quota);
}

/**
 * Quota quotidien d'analyses (jour calendaire Europe/Paris), persistant en base : un compteur en
 * mémoire serait remis à zéro à chaque redémarrage, ce qui est inadapté à un plafond de coût.
 */
export function createQuotaService(db: Database, options: QuotaOptions) {
  const now = options.now ?? (() => new Date());

  /** Jour Europe/Paris et prochain minuit (instant), calculés par la base pour gérer l'heure d'été. */
  async function window(at: Date) {
    const result = await db.execute<{ day: string; resets_at: Date }>(sql`
      select
        (timezone('Europe/Paris', ${at.toISOString()}::timestamptz))::date::text as day,
        timezone('Europe/Paris',
          ((timezone('Europe/Paris', ${at.toISOString()}::timestamptz))::date + 1)::timestamp
        ) as resets_at`);
    const row = result.rows[0]!;
    return { day: row.day, resetsAt: new Date(row.resets_at) };
  }

  /** Lignes qui comptent : réussies, ou en cours depuis peu. */
  const counted = (at: Date) => sql`(
    ${aiAnalyses.status} = 'succeeded'
    or (${aiAnalyses.status} = 'pending'
        and ${aiAnalyses.createdAt} > ${new Date(at.getTime() - PENDING_TTL_MS).toISOString()}::timestamptz)
  )`;

  async function countFor(tx: Pick<Database, 'select'>, userId: string, day: string, at: Date) {
    const [row] = await tx
      .select({ used: sql<number>`count(*)::int` })
      .from(aiAnalyses)
      .where(and(eq(aiAnalyses.userId, userId), eq(aiAnalyses.day, day), counted(at)));
    return row!.used;
  }

  const build = (used: number, resetsAt: Date): Quota => ({
    enabled: true,
    limit: options.limit,
    used: Math.min(used, options.limit),
    remaining: Math.max(0, options.limit - used),
    resetsAt: resetsAt.toISOString(),
  });

  return {
    limit: options.limit,

    async status(userId: string): Promise<Quota> {
      const at = now();
      const { day, resetsAt } = await window(at);
      return build(await countFor(db, userId, day, at), resetsAt);
    },

    /**
     * Réserve une analyse avant l'appel à Anthropic. Le verrou consultatif sérialise les requêtes
     * d'un même utilisateur : deux requêtes simultanées ne peuvent pas dépasser le plafond.
     */
    async reserve(userId: string, boardId: string | null, model: string): Promise<Reservation> {
      const at = now();
      const { day, resetsAt } = await window(at);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

        const [inProgress] = await tx
          .select({ id: aiAnalyses.id })
          .from(aiAnalyses)
          .where(
            and(
              eq(aiAnalyses.userId, userId),
              eq(aiAnalyses.status, 'pending'),
              sql`${aiAnalyses.createdAt} > ${new Date(at.getTime() - PENDING_TTL_MS).toISOString()}::timestamptz`,
            ),
          )
          .limit(1);
        const used = await countFor(tx, userId, day, at);
        if (inProgress) {
          throw quotaError(
            409,
            'analysis_in_progress',
            'Une analyse est déjà en cours. Attendez son résultat.',
            build(used, resetsAt),
          );
        }
        if (used >= options.limit) {
          throw quotaError(
            429,
            'quota_exceeded',
            `Limite atteinte (${options.limit} analyses par jour).`,
            build(used, resetsAt),
          );
        }

        const [row] = await tx
          .insert(aiAnalyses)
          .values({ userId, boardId, model, day, createdAt: at, status: 'pending' })
          .returning({ id: aiAnalyses.id });
        return { id: row!.id, quota: build(used + 1, resetsAt) };
      });
    },

    async succeed(id: string, result: AnalysisResult) {
      await db
        .update(aiAnalyses)
        .set({ status: 'succeeded', ...result })
        .where(eq(aiAnalyses.id, id));
    },

    /** Restitue l'analyse : l'échec est technique, l'utilisateur ne doit pas le payer. */
    async fail(id: string) {
      await db.update(aiAnalyses).set({ status: 'failed' }).where(eq(aiAnalyses.id, id));
    },
  };
}

export type QuotaService = ReturnType<typeof createQuotaService>;
