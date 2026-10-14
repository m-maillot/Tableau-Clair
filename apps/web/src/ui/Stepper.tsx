import { Icon } from './Icon';
import styles from './Stepper.module.css';

export interface StepperProps {
  /** Nom du champ, lu par les lecteurs d'écran (« Largeur »). */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Texte de l'unité lu avec la valeur (« modules »). */
  unit?: string;
}

export function Stepper({ label, value, onChange, min = 1, max, unit }: StepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <div role="group" aria-label={label} className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        aria-label={`Diminuer : ${label}`}
        disabled={atMin}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" size={18} strokeWidth={2.6} />
      </button>
      <output className={styles.value} aria-live="polite">
        {value}
        {unit ? <span className="sr-only"> {unit}</span> : null}
      </output>
      <button
        type="button"
        className={styles.button}
        aria-label={`Augmenter : ${label}`}
        disabled={atMax}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size={18} strokeWidth={2.6} />
      </button>
    </div>
  );
}
