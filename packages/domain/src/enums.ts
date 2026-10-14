/** Valeurs partagées entre la base, l'API et le front (spec §5, §6). */

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATIONS = ['verified', 'assumed', 'unknown'] as const;
export type Verification = (typeof VERIFICATIONS)[number];

export const ELEMENT_KINDS = [
  'rcd', // interrupteur différentiel
  'breaker', // disjoncteur divisionnaire
  'hphc_contactor', // contacteur heures pleines / creuses
  'impulse_relay', // télérupteur
  'surge_protector', // parafoudre
  'energy_meter', // compteur / suivi de consommation
  'connected_module', // module connecté (ex. Shelly)
  'relay', // relais / contacteur modulaire
  'spare', // emplacement libre / réserve
  'custom', // élément personnalisé
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const FIXTURE_KINDS = ['socket', 'light', 'appliance', 'zone', 'unknown'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export const CURVES = ['B', 'C', 'D'] as const;
export type Curve = (typeof CURVES)[number];

export const RCD_TYPES = ['AC', 'A', 'F', 'B'] as const;
export type RcdType = (typeof RCD_TYPES)[number];

export const PHOTO_USAGES = ['board', 'element', 'fixture', 'floor_background'] as const;
export type PhotoUsage = (typeof PHOTO_USAGES)[number];
