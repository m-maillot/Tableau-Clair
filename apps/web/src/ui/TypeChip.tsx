import type { ButtonHTMLAttributes } from 'react';
import styles from './TypeChip.module.css';

export interface TypeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  /** Largeur en modules, affichée après le libellé (« Différentiel · 2 »). */
  width?: number;
  selected?: boolean;
  /** `dashed` : réserve ; `outline` : « Autre appareil… ». */
  variant?: 'solid' | 'dashed' | 'outline';
  /** Pourquoi le type est indisponible (ex. « 2 modules requis, 1 disponible »). */
  disabledReason?: string;
}

export function TypeChip({
  label,
  width,
  selected = false,
  variant = 'solid',
  disabledReason,
  disabled,
  type = 'button',
  className,
  ...rest
}: TypeChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      disabled={disabled}
      className={[styles.chip, styles[variant], selected && styles.selected, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {width === undefined ? label : `${label} · ${width}`}
      {disabled && disabledReason ? <span className="sr-only"> ({disabledReason})</span> : null}
    </button>
  );
}
