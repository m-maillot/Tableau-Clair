import type { ConflictRow } from './ConflictSheet';

/** Libellés des champs affichés dans la comparaison. */
export const FIELD_LABEL: Record<string, string> = {
  label: 'Libellé',
  kind: 'Type',
  name: 'Nom',
  x: 'Position X',
  y: 'Position Y',
  w: 'Largeur',
  h: 'Hauteur',
  roomId: 'Pièce',
  width: 'Largeur du plan',
  height: 'Hauteur du plan',
  position: 'Module',
  rowId: 'Rangée',
  notes: 'Notes',
  backgroundOpacity: 'Opacité du fond',
  backgroundLocked: 'Fond verrouillé',
};

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  return String(value);
};

/** Champs envoyés par la personne qui diffèrent de la version enregistrée. */
export function compareFields(
  mine: Record<string, unknown>,
  saved: Record<string, unknown>,
  display: (key: string, value: unknown) => string = (_k, v) => show(v),
): ConflictRow[] {
  return Object.entries(mine)
    .filter(([key]) => key !== 'version' && key in FIELD_LABEL && mine[key] !== saved[key])
    .map(([key, value]) => ({
      label: FIELD_LABEL[key]!,
      mine: display(key, value),
      saved: display(key, saved[key]),
    }));
}
