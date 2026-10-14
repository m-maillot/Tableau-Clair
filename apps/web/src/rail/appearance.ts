import type { ElementKind } from '@tableau-clair/domain';

/** Nom français de chaque type d'élément. */
export const KIND_LABEL: Record<ElementKind, string> = {
  rcd: 'Différentiel',
  breaker: 'Disjoncteur',
  hphc_contactor: 'Contacteur HC',
  impulse_relay: 'Télérupteur',
  surge_protector: 'Parafoudre',
  energy_meter: 'Compteur',
  connected_module: 'Module connecté',
  relay: 'Relais',
  spare: 'Réserve',
  custom: 'Autre appareil',
};

/** Famille visuelle (spec §15.2). */
export type Tone = 'ink' | 'blue' | 'other' | 'connected' | 'spare';

export interface Appearance {
  tone: Tone;
  /** Texte en gros : calibre ou sigle. Vide pour une réserve. */
  top: string;
  /** Nom du type, pour les lecteurs d'écran et la feuille de détail. */
  kindLabel: string;
}

interface Appearing {
  kind: ElementKind;
  ratingA: number | null;
  brand: string | null;
}

const SIGLE: Partial<Record<ElementKind, string>> = {
  hphc_contactor: 'HC',
  impulse_relay: 'TL',
  surge_protector: 'PF',
  energy_meter: 'kWh',
  relay: 'RL',
  custom: '···',
};

/** Rendu d'un élément sur le rail : famille de couleur et texte principal. */
export function appearanceOf(element: Appearing): Appearance {
  const kindLabel = KIND_LABEL[element.kind];
  const rating = element.ratingA;

  switch (element.kind) {
    case 'rcd':
      return { tone: 'ink', top: rating ? `${rating} A` : '—', kindLabel };
    case 'breaker':
      return { tone: 'blue', top: rating ? String(rating) : '—', kindLabel };
    case 'connected_module':
      return {
        tone: 'connected',
        top: element.brand?.trim().charAt(0).toUpperCase() || 'C',
        kindLabel,
      };
    case 'spare':
      return { tone: 'spare', top: '', kindLabel };
    default:
      return { tone: 'other', top: SIGLE[element.kind] ?? '···', kindLabel };
  }
}

/** « module 4 » ou « modules 17–18 », 1-indexés comme sur le tableau physique. */
export function moduleRange(position: number, width: number): string {
  return width === 1 ? `module ${position + 1}` : `modules ${position + 1}–${position + width}`;
}
