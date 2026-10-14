const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** « aujourd'hui », « hier », « le 12 oct. » — relatif au jour calendaire, pas à 24 h glissantes. */
export function relativeDay(at: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  return `le ${at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

/** Prénom affichable : nom enregistré, à défaut la partie locale de l'adresse. */
export function greetingName(user: { displayName: string | null; email: string }): string {
  const raw = user.displayName?.trim() || user.email.split('@')[0] || user.email;
  const first = raw.split(/[\s._-]+/)[0] ?? raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Auteur d'une modification : le serveur envoie un nom, ou à défaut une adresse. */
function authorName(by: string): string {
  return by.includes('@') ? greetingName({ displayName: null, email: by }) : by;
}

/** Texte de la carte de fiabilité : « Modifié hier par Martial ». */
export function lastModifiedLabel(
  lastModified: { at: string; by: string | null } | null,
  now: Date = new Date(),
): string | null {
  if (!lastModified) return null;
  const when = relativeDay(new Date(lastModified.at), now);
  return lastModified.by ? `Modifié ${when} par ${authorName(lastModified.by)}` : `Modifié ${when}`;
}

export const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);
