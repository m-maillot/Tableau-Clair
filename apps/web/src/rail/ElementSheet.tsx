import type { Element } from '@tableau-clair/contracts';
import { plural } from '../home/format';
import { BottomSheet, Icon } from '../ui';
import { appearanceOf, moduleRange } from './appearance';
import styles from './ElementSheet.module.css';

interface ElementSheetProps {
  element: Element | null;
  rowIndex: number;
  /** Faux pour un lecteur : les actions de modification ne sont pas proposées. */
  canEdit: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onChangeRow: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface Detail {
  label: string;
  value: string;
}

function detailsOf(element: Element): Detail[] {
  const list: Detail[] = [{ label: 'Type', value: appearanceOf(element).kindLabel }];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '')
      list.push({ label, value: String(value) });
  };

  add('Rôle', element.role);
  add('Calibre', element.ratingA ? `${element.ratingA} A` : null);
  add('Courbe', element.curve);
  add('Pôles', element.poles);
  add('Sensibilité', element.sensitivityMa ? `${element.sensitivityMa} mA` : null);
  add('Type de différentiel', element.rcdType);
  add('Marque', element.brand);
  add('Modèle / référence', element.model);
  add('Câbles sortants', element.outgoingCables);
  add(
    'Section des câbles',
    element.cableSection ? `${String(element.cableSection).replace('.', ',')} mm²` : null,
  );
  add('Notes', element.notes);
  return list;
}

/**
 * Feuille de détail d'un élément sélectionné : persistante, le rail reste utilisable derrière.
 * Les flèches décalent d'un module ; c'est l'alternative tactile au glisser-déposer (spec §15.5).
 */
export function ElementSheet({
  element,
  rowIndex,
  canEdit,
  busy,
  onMove,
  onChangeRow,
  onDelete,
  onClose,
}: ElementSheetProps) {
  if (!element) return null;
  const linked = element.linkedFixtures;
  const description = [
    `Rangée ${rowIndex + 1}`,
    moduleRange(element.position, element.width),
    linked > 0 ? `${linked} ${plural(linked, 'équipement lié', 'équipements liés')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={onClose}
      title={element.label}
      description={description}
      footer={
        canEdit ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.square}
              aria-label="Déplacer à gauche"
              disabled={busy}
              onClick={() => onMove(-1)}
            >
              <Icon name="arrow-left" size={20} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className={styles.square}
              aria-label="Déplacer à droite"
              disabled={busy}
              onClick={() => onMove(1)}
            >
              <Icon name="arrow-right" size={20} strokeWidth={2.4} />
            </button>
            <button type="button" className={styles.wide} disabled={busy} onClick={onChangeRow}>
              Changer de rangée
            </button>
            <button
              type="button"
              className={`${styles.square} ${styles.danger}`}
              aria-label="Supprimer l’élément"
              disabled={busy}
              onClick={onDelete}
            >
              <Icon name="trash" size={20} strokeWidth={2.2} />
            </button>
          </div>
        ) : undefined
      }
    >
      <dl className={styles.list}>
        {detailsOf(element).map((detail) => (
          <div key={detail.label} className={styles.item}>
            <dt>{detail.label}</dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
    </BottomSheet>
  );
}
