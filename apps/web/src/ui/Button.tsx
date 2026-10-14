import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';
import { Icon, type IconName } from './Icon';

export type ButtonVariant =
  'primary' | 'secondary' | 'lime' | 'outline' | 'ghost' | 'danger' | 'danger-soft';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `lg` : 54 px, action principale d'un écran ; `md` : 44 px. */
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  icon?: IconName;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.full,
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** Nom accessible, obligatoire : un bouton sans texte visible doit être nommé. */
  label: string;
  icon: IconName;
  variant?: 'surface' | 'ink' | 'white';
}

export function IconButton({
  label,
  icon,
  variant = 'surface',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(styles.iconButton, styles[`icon-${variant}`], className)}
      {...rest}
    >
      <Icon name={icon} size={18} strokeWidth={2.6} />
    </button>
  );
}
