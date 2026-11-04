import type { Curve, ElementKind, RcdType } from './enums';
import { validateSpan, type Placed } from './rail';

/** Plafond d'appareils qu'une proposition ou un ajout en lot peut contenir. */
export const MAX_PROPOSED_ELEMENTS = 200;

export type Confidence = 'high' | 'medium' | 'low';

/** Appareil proposé à partir d'une photo, tel que lu par le modèle (déjà validé en forme). */
export interface ProposedElement {
  position: number;
  width: number;
  kind: ElementKind;
  label?: string | undefined;
  ratingA?: number | undefined;
  poles?: number | undefined;
  curve?: Curve | undefined;
  sensitivityMa?: number | undefined;
  rcdType?: RcdType | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  confidence: Confidence;
}

export interface ProposedRow {
  /** 0 = rangée du haut. */
  index: number;
  elements: ProposedElement[];
}

/** Rangée du tableau cible, avec ce qui y est déjà posé. */
export interface BoardRowState {
  index: number;
  capacity: number;
  elements: readonly Placed[];
}

export type ProposalConflict = 'overlap' | 'out_of_bounds';

export interface NormalizedElement extends Omit<ProposedElement, 'label'> {
  /** Toujours renseigné : un libellé par défaut est généré si la photo n'en donne pas. */
  label: string;
  /** Raison pour laquelle l'appareil ne peut pas être ajouté tel quel, sinon `null`. */
  conflict: ProposalConflict | null;
}

export interface NormalizedRow {
  index: number;
  elements: NormalizedElement[];
}

const DEFAULT_LABELS: Record<ElementKind, string> = {
  rcd: 'Différentiel',
  breaker: 'Disjoncteur',
  hphc_contactor: 'Contacteur heures creuses',
  impulse_relay: 'Télérupteur',
  surge_protector: 'Parafoudre',
  energy_meter: 'Compteur',
  connected_module: 'Module connecté',
  relay: 'Relais',
  spare: 'Réserve',
  custom: 'Appareil',
};

/** Libellé de repli : « Disjoncteur 16 A », « Différentiel 40 A 30 mA »… */
export function defaultLabel(
  element: Pick<ProposedElement, 'kind' | 'ratingA' | 'sensitivityMa'>,
): string {
  const parts: string[] = [DEFAULT_LABELS[element.kind]];
  if (element.ratingA) parts.push(`${element.ratingA} A`);
  if (element.kind === 'rcd' && element.sensitivityMa) parts.push(`${element.sensitivityMa} mA`);
  return parts.join(' ');
}

const toInt = (value: number, minimum: number) =>
  Number.isFinite(value) ? Math.max(minimum, Math.round(value)) : minimum;

/**
 * Prépare la proposition du modèle pour la relecture : ignore les rangées inconnues, arrondit les
 * positions, garantit un libellé et signale ce qui ne peut pas être posé (chevauchement avec un
 * appareil existant ou avec une proposition précédente, dépassement de la rangée).
 * Rien n'est écarté silencieusement hormis les rangées qui n'existent pas dans le tableau.
 */
export function normalizeProposal(
  proposed: readonly ProposedRow[],
  board: readonly BoardRowState[],
  options: { maxLabelLength: number; maxElements?: number } = { maxLabelLength: 120 },
): NormalizedRow[] {
  const max = options.maxElements ?? MAX_PROPOSED_ELEMENTS;
  const rows = new Map<number, NormalizedRow>();
  let count = 0;

  // Les rangées d'un même index renvoyées en double sont fusionnées.
  for (const row of [...proposed].sort((a, b) => a.index - b.index)) {
    const target = board.find((r) => r.index === row.index);
    if (!target) continue;
    const out = rows.get(row.index) ?? { index: row.index, elements: [] };
    rows.set(row.index, out);

    const taken: Placed[] = [...target.elements];
    const ordered = row.elements
      .map((e) => ({ ...e, position: toInt(e.position, 0), width: toInt(e.width, 1) }))
      .sort((a, b) => a.position - b.position);

    for (const element of ordered) {
      if (count >= max) break;
      count += 1;
      const label = (element.label ?? '').trim().slice(0, options.maxLabelLength);
      const problem = validateSpan({ capacity: target.capacity, elements: taken }, element);
      if (!problem) taken.push({ id: `proposal-${count}`, ...element });
      out.elements.push({
        ...element,
        label: label || defaultLabel(element),
        conflict: problem ? (problem.code === 'overlap' ? 'overlap' : 'out_of_bounds') : null,
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.index - b.index);
}
