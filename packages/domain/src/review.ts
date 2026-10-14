import type { CircuitLink } from './circuits';
import type { Verification } from './enums';

export interface Reliability {
  total: number;
  verified: number;
  assumed: number;
  /** Équipements sans liaison, ou liaison « inconnue ». */
  unknown: number;
}

/** Statut effectif d'un équipement : sans liaison, il est « inconnu ». */
export function effectiveStatus(links: readonly CircuitLink[], fixtureId: string): Verification {
  const link = links.find((l) => l.fixtureId === fixtureId);
  if (!link || link.breakerId === null) return 'unknown';
  return link.status;
}

/** Fiabilité du repérage (carte de l'accueil, barre segmentée). */
export function reliability(
  fixtureIds: readonly string[],
  links: readonly CircuitLink[],
): Reliability {
  const result: Reliability = { total: fixtureIds.length, verified: 0, assumed: 0, unknown: 0 };
  for (const id of fixtureIds) result[effectiveStatus(links, id)] += 1;
  return result;
}

export interface ReviewItems {
  /** Équipements dont la liaison n'est que supposée. */
  assumed: string[];
  /** Équipements sans disjoncteur identifié. */
  unlinkedFixtures: string[];
  /** Disjoncteurs qui n'alimentent aucun équipement connu. */
  idleBreakers: string[];
}

/** Contenu de l'écran « À vérifier ». */
export function reviewItems(
  fixtureIds: readonly string[],
  breakerIds: readonly string[],
  links: readonly CircuitLink[],
): ReviewItems {
  const used = new Set(links.map((l) => l.breakerId).filter((id): id is string => id !== null));
  return {
    assumed: fixtureIds.filter((id) => effectiveStatus(links, id) === 'assumed'),
    unlinkedFixtures: fixtureIds.filter((id) => {
      const link = links.find((l) => l.fixtureId === id);
      return !link || link.breakerId === null;
    }),
    idleBreakers: breakerIds.filter((id) => !used.has(id)),
  };
}
