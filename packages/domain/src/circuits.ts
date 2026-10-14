import type { ElementKind, Verification } from './enums';
import { err, ok, type Result } from './result';

/** Liaison d'un équipement du plan à un disjoncteur du tableau. */
export interface CircuitLink {
  fixtureId: string;
  /** `null` : équipement identifié mais disjoncteur inconnu ou supprimé. */
  breakerId: string | null;
  status: Verification;
}

export type LinkError =
  | { code: 'breaker_not_found'; breakerId: string }
  | { code: 'not_a_breaker'; breakerId: string }
  | { code: 'not_linked'; fixtureId: string }
  | { code: 'status_requires_breaker'; fixtureId: string };

export type LinkResult = Result<readonly CircuitLink[], LinkError>;

/** Types d'éléments qui alimentent des circuits (décision V1 : les disjoncteurs divisionnaires). */
export function canPowerCircuits(kind: ElementKind): boolean {
  return kind === 'breaker';
}

export interface BreakerRef {
  id: string;
  kind: ElementKind;
}

const withoutFixture = (links: readonly CircuitLink[], fixtureId: string) =>
  links.filter((l) => l.fixtureId !== fixtureId);

/**
 * Relie un équipement à un disjoncteur. Un équipement n'a qu'une liaison : elle remplace
 * la précédente. Sans disjoncteur, le statut ne peut être que « inconnu ».
 */
export function linkFixture(
  links: readonly CircuitLink[],
  link: { fixtureId: string; breakerId: string; status: Verification },
  elements: readonly BreakerRef[],
): LinkResult {
  const breaker = elements.find((e) => e.id === link.breakerId);
  if (!breaker) return err({ code: 'breaker_not_found', breakerId: link.breakerId });
  if (!canPowerCircuits(breaker.kind))
    return err({ code: 'not_a_breaker', breakerId: link.breakerId });
  return ok([...withoutFixture(links, link.fixtureId), link]);
}

/** Retire la liaison d'un équipement : il redevient « à identifier ». */
export function unlinkFixture(links: readonly CircuitLink[], fixtureId: string): CircuitLink[] {
  return withoutFixture(links, fixtureId);
}

/**
 * Suppression d'un disjoncteur : ses équipements restent, leur liaison passe à « inconnu »
 * (même règle que le trigger de la base).
 */
export function removeBreaker(links: readonly CircuitLink[], breakerId: string): CircuitLink[] {
  return links.map((l) =>
    l.breakerId === breakerId ? { ...l, breakerId: null, status: 'unknown' } : l,
  );
}

/** Change le statut d'une liaison existante ; « vérifiée » et « supposée » exigent un disjoncteur. */
export function setLinkStatus(
  links: readonly CircuitLink[],
  fixtureId: string,
  status: Verification,
): LinkResult {
  const link = links.find((l) => l.fixtureId === fixtureId);
  if (!link) return err({ code: 'not_linked', fixtureId });
  if (status !== 'unknown' && link.breakerId === null) {
    return err({ code: 'status_requires_breaker', fixtureId });
  }
  return ok(links.map((l) => (l.fixtureId === fixtureId ? { ...l, status } : l)));
}

/** « Je viens de le couper, c'est bien tombé » : la liaison devient vérifiée. */
export function confirmLink(links: readonly CircuitLink[], fixtureId: string): LinkResult {
  return setLinkStatus(links, fixtureId, 'verified');
}

// --- Recherche dans les deux sens -------------------------------------------------------------------

/** Depuis un disjoncteur : les équipements qu'il alimente. */
export function fixturesOfBreaker(links: readonly CircuitLink[], breakerId: string): CircuitLink[] {
  return links.filter((l) => l.breakerId === breakerId);
}

/** Depuis un équipement : le disjoncteur à couper, ou `undefined` s'il est inconnu. */
export function breakerOfFixture(
  links: readonly CircuitLink[],
  fixtureId: string,
): CircuitLink | undefined {
  const link = links.find((l) => l.fixtureId === fixtureId);
  return link?.breakerId ? link : undefined;
}
