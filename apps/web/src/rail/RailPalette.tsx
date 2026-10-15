import { DEFAULT_WIDTH, type ElementKind } from '@tableau-clair/domain';
import { KIND_LABEL } from './appearance';
import { beginDrag, endDrag, KIND_MIME } from './RailRow';
import styles from './RailPalette.module.css';

/** Types de la palette du mode bureau, dans l'ordre des maquettes. */
export const PALETTE_KINDS: ElementKind[] = [
  'breaker',
  'rcd',
  'hphc_contactor',
  'impulse_relay',
  'surge_protector',
  'energy_meter',
  'connected_module',
  'relay',
  'spare',
];

interface RailPaletteProps {
  /** Type « armé » : le prochain module libre cliqué reçoit cet appareil. */
  armed: ElementKind | null;
  onArm: (kind: ElementKind | null) => void;
}

/** « Ajouter sur le rail » : glisser un type sur un module libre, ou l'armer puis cliquer. */
export function RailPalette({ armed, onArm }: RailPaletteProps) {
  return (
    <section className={styles.palette} aria-label="Ajouter sur le rail">
      <h2 className={styles.title}>Ajouter sur le rail</h2>
      <p className={styles.hint}>
        Glissez un appareil sur un module libre, ou choisissez-le puis cliquez.
      </p>
      <ul className={styles.list}>
        {PALETTE_KINDS.map((kind) => (
          <li key={kind}>
            <div
              // Un <button> ne se glisse pas sous Firefox : zone `role="button"`.
              role="button"
              tabIndex={0}
              className={`${styles.chip} ${armed === kind ? styles.armed : ''}`}
              aria-pressed={armed === kind}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(KIND_MIME, kind);
                event.dataTransfer.effectAllowed = 'copy';
                beginDrag(DEFAULT_WIDTH[kind]);
              }}
              onDragEnd={endDrag}
              onClick={() => onArm(armed === kind ? null : kind)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onArm(armed === kind ? null : kind);
                }
              }}
            >
              <span>{KIND_LABEL[kind]}</span>
              <span className={styles.width}>{DEFAULT_WIDTH[kind]} mod.</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
