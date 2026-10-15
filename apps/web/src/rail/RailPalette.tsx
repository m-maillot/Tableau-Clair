import { DEFAULT_WIDTH, type ElementKind } from '@tableau-clair/domain';
import { KIND_LABEL } from './appearance';
import { KIND_MIME } from './RailRow';
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
            <button
              type="button"
              className={`${styles.chip} ${armed === kind ? styles.armed : ''}`}
              aria-pressed={armed === kind}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(KIND_MIME, kind);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onArm(armed === kind ? null : kind)}
            >
              <span>{KIND_LABEL[kind]}</span>
              <span className={styles.width}>{DEFAULT_WIDTH[kind]} mod.</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
