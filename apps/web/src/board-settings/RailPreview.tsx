import type { Board } from '@tableau-clair/contracts';
import { analyzeBoardResize } from '@tableau-clair/domain';
import styles from './RailPreview.module.css';

type Element = Board['rows'][number]['elements'][number];

const KIND_STYLE: Record<Element['kind'], string> = {
  rcd: styles.rcd!,
  breaker: styles.breaker!,
  hphc_contactor: styles.other!,
  impulse_relay: styles.other!,
  surge_protector: styles.other!,
  energy_meter: styles.other!,
  relay: styles.other!,
  custom: styles.other!,
  connected_module: styles.connected!,
  spare: styles.spare!,
};

interface RailPreviewProps {
  board: Board;
  /** Géométrie visée : l'aperçu montre ce qu'elle ferait de la composition actuelle. */
  target: { rowCount: number; modulesPerRow: number };
}

/** Aperçu de la composition à la géométrie visée : zone hors rail hachurée, éléments fautifs cernés. */
export function RailPreview({ board, target }: RailPreviewProps) {
  const analysis = analyzeBoardResize(
    board.rows.map((row) => ({ index: row.index, elements: row.elements })),
    target,
  );
  const overflowing = new Set(analysis.overflowingElementIds);
  const rows = board.rows.filter((row) => row.index < Math.max(target.rowCount, 1));
  const columns = Math.max(target.modulesPerRow, ...rows.map((row) => row.capacity));

  return (
    <div className={styles.preview}>
      {rows.map((row) => {
        const end = Math.max(0, ...row.elements.map((e) => e.position + e.width));
        const exceeds = end > target.modulesPerRow;
        return (
          <div key={row.id}>
            <div className={styles.header}>
              <span>Rangée {row.index + 1}</span>
              <span className={exceeds ? styles.over : styles.fine}>
                {end} / {target.modulesPerRow}
                {exceeds ? ' — dépasse' : ''}
              </span>
            </div>
            <div
              className={styles.grid}
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              aria-hidden="true"
            >
              {columns > target.modulesPerRow && (
                <div
                  className={styles.outside}
                  style={{
                    gridColumn: `${target.modulesPerRow + 1} / span ${columns - target.modulesPerRow}`,
                  }}
                />
              )}
              {row.elements.map((element) => (
                <div
                  key={element.id}
                  className={`${styles.element} ${KIND_STYLE[element.kind]} ${
                    overflowing.has(element.id) ? styles.flagged : ''
                  }`}
                  style={{ gridColumn: `${element.position + 1} / span ${element.width}` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
