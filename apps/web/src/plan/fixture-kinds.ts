import type { FixtureKind } from '@tableau-clair/domain';
import type { IconName } from '../ui';

export const FIXTURE_KIND_LABEL: Record<FixtureKind, string> = {
  socket: 'Prise',
  light: 'Point lumineux',
  appliance: 'Appareil dédié',
  zone: 'Zone',
  unknown: 'À confirmer',
};

export const FIXTURE_KIND_ICON: Record<FixtureKind, IconName> = {
  socket: 'socket',
  light: 'bulb',
  appliance: 'plug',
  zone: 'plan',
  unknown: 'help',
};

export const FIXTURE_KINDS_ORDER: FixtureKind[] = [
  'socket',
  'light',
  'appliance',
  'zone',
  'unknown',
];

/** Libellé proposé à la pose, numéroté pour rester distinct dans la liste. */
export function defaultFixtureLabel(
  kind: FixtureKind,
  existing: readonly { label: string }[],
): string {
  const base = FIXTURE_KIND_LABEL[kind];
  const used = new Set(existing.map((f) => f.label));
  for (let n = 1; ; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
