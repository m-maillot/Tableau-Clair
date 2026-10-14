/** Normalise une adresse pour comparaison : sans espaces, en minuscules. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Lit une liste d'adresses séparées par des virgules, des points-virgules ou des espaces. */
export function parseAllowedEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(/[,;\s]+/)
      .map(normalizeEmail)
      .filter((email) => email.length > 0),
  );
}

export function isEmailAllowed(allowed: ReadonlySet<string>, email: string | null | undefined) {
  return typeof email === 'string' && allowed.has(normalizeEmail(email));
}
