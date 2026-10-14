import type { Board } from '@tableau-clair/contracts';
import styles from './OccupationList.module.css';

/** Occupation actuelle de chaque rangée, comparée au nombre de modules visé. */
export function OccupationList({ board, modulesPerRow }: { board: Board; modulesPerRow: number }) {
  return (
    <ul className={styles.list} aria-label="Occupation actuelle">
      {board.rows.map((row) => {
        const end = Math.max(0, ...row.elements.map((e) => e.position + e.width));
        const over = end > modulesPerRow;
        return (
          <li key={row.id} className={styles.item}>
            <span className={styles.name}>Rangée {row.index + 1}</span>
            <span className={styles.bar} aria-hidden="true">
              <span
                className={over ? styles.fillOver : styles.fill}
                style={{ width: `${Math.min(100, (end / Math.max(1, modulesPerRow)) * 100)}%` }}
              />
            </span>
            <span className={`${styles.value} ${over ? styles.valueOver : ''}`}>
              {end} / {modulesPerRow}
              {over && <span className="sr-only"> — dépasse</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
