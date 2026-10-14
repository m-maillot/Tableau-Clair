import type { Board, Element } from '@tableau-clair/contracts';
import { nearestFreePosition } from '@tableau-clair/domain';
import { plural } from '../home/format';
import { BottomSheet } from '../ui';
import styles from './RowPickerSheet.module.css';

interface RowPickerSheetProps {
  board: Board;
  element: Element | null;
  onPick: (rowId: string) => void;
  onClose: () => void;
}

/** Choix de la rangée de destination : celles où l'élément ne tient pas sont grisées. */
export function RowPickerSheet({ board, element, onPick, onClose }: RowPickerSheetProps) {
  if (!element) return null;
  const others = board.rows.filter((row) => row.id !== element.rowId);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Changer de rangée"
      description={`« ${element.label} » occupe ${element.width} ${plural(element.width, 'module', 'modules')}`}
    >
      {others.length === 0 ? (
        <p className={styles.empty}>Ce tableau n’a qu’une seule rangée.</p>
      ) : (
        <ul className={styles.list}>
          {others.map((row) => {
            const position = nearestFreePosition(row, element.width, element.position);
            const fits = position !== null;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.option}
                  disabled={!fits}
                  onClick={() => onPick(row.id)}
                >
                  <span className={styles.name}>Rangée {row.index + 1}</span>
                  <span className={styles.detail}>
                    {row.used} / {row.capacity} modules
                    {fits ? ` · au module ${position + 1}` : ' · pas de place'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
