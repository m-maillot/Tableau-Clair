import { Icon } from './Icon';
import styles from './Stepper.module.css';

export interface StepperProps {
  /** Nom du champ, lu par les lecteurs d'écran (« Largeur »). */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Pas d'une pression (1 par défaut). */
  step?: number;
  /** Texte de l'unité lu avec la valeur (« modules »). */
  unit?: string;
  /** Valeur refusée : le contrôle passe en erreur ; `describedBy` pointe le message. */
  invalid?: boolean;
  describedBy?: string;
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  unit,
  invalid = false,
  describedBy,
}: StepperProps) {
  const atMin = value - step < min;
  const atMax = max !== undefined && value + step > max;
  return (
    <div
      role="group"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`${styles.stepper} ${invalid ? styles.invalid : ''}`}
    >
      <button
        type="button"
        className={styles.button}
        aria-label={`Diminuer : ${label}`}
        disabled={atMin}
        onClick={() => onChange(value - step)}
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
        onClick={() => onChange(value + step)}
      >
        <Icon name="plus" size={18} strokeWidth={2.6} />
      </button>
    </div>
  );
}
