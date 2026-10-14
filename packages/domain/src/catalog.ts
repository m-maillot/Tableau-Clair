import type { ElementKind } from './enums';
import { maxWidthAt, type RowState } from './rail';

/** Largeur par défaut, en modules, de chaque type standard (spec §6). Modifiable par l'utilisateur. */
export const DEFAULT_WIDTH: Record<ElementKind, number> = {
  rcd: 2,
  breaker: 1,
  hphc_contactor: 1,
  impulse_relay: 1,
  surge_protector: 2,
  energy_meter: 2,
  connected_module: 1,
  relay: 1,
  spare: 1,
  custom: 1,
};

export interface SelectableKind {
  kind: ElementKind;
  /** Largeur proposée par défaut. */
  width: number;
  /** Faux si la largeur par défaut ne tient pas dans l'espace restant : le type est grisé. */
  enabled: boolean;
}

/**
 * Types proposables depuis le module libre `position`, avec leur disponibilité.
 * Un type personnalisé reste choisissable dès qu'un module est libre : sa largeur se règle ensuite.
 */
export function selectableKinds(row: RowState, position: number): SelectableKind[] {
  const max = maxWidthAt(row, position);
  return (Object.keys(DEFAULT_WIDTH) as ElementKind[]).map((kind) => ({
    kind,
    width: DEFAULT_WIDTH[kind],
    enabled: DEFAULT_WIDTH[kind] <= max,
  }));
}
