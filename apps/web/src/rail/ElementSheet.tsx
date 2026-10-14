import type { Element } from '@tableau-clair/contracts';
import { BottomSheet } from '../ui';
import { appearanceOf, moduleRange } from './appearance';
import styles from './ElementSheet.module.css';

interface ElementSheetProps {
  element: Element | null;
  rowIndex: number;
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

/** Feuille de détail d'un élément sélectionné : persistante, le rail reste utilisable derrière. */
export function ElementSheet({ element, rowIndex, onClose }: ElementSheetProps) {
  if (!element) return null;
  const look = appearanceOf(element);

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={onClose}
      title={element.label}
      description={`Rangée ${rowIndex + 1} · ${moduleRange(element.position, element.width)}`}
    >
      <div className={styles.head} aria-hidden="true">
        <span className={styles.badge}>{look.top || '·'}</span>
      </div>
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
