/**
 * Limiteur à fenêtre fixe en mémoire (instance unique, voir spec §9).
 * Sert à plafonner les demandes de lien magique par adresse, en plus de la limite par IP.
 */
export function createRateLimiter(options: { max: number; windowMs: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Enregistre une tentative ; faux si la limite est dépassée. */
    take(key: string): boolean {
      const time = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= time) {
        hits.set(key, { count: 1, resetAt: time + options.windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= options.max;
    },
  };
}
