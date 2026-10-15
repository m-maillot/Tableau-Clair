import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './ScreenState.module.css';

/** Squelette à la forme du contenu ; annoncé comme « Chargement… » (role="status"). */
export function LoadingState({
  label = 'Chargement…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" className={styles.loading}>
      <span className="sr-only">{label}</span>
      <div className={`${styles.bar} ${styles.title}`} aria-hidden="true" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${styles.bar} ${styles.block}`} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Erreur de chargement : carte annoncée, avec une action de sortie. */
export function ErrorState({
  title,
  text,
  onRetry,
  action,
}: {
  title: string;
  text?: string;
  onRetry?: () => void;
  /** Action de sortie supplémentaire (retour, reconnexion…). */
  action?: ReactNode;
}) {
  return (
    <div role="alert" className={styles.error}>
      <Icon name="alert-circle" size={24} strokeWidth={2.4} />
      <div className={styles.body}>
        <p className={styles.heading}>{title}</p>
        {text && <p className={styles.text}>{text}</p>}
        <div className={styles.actions}>
          {onRetry && (
            <Button size="md" icon="refresh" onClick={onRetry}>
              Réessayer
            </Button>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

/** Gabarit unique des états vides : pastille d'icône, titre, phrase, une action. */
export function EmptyState({
  icon,
  tone = 'neutral',
  title,
  text,
  action,
}: {
  icon: IconName;
  /** `invite` (lime) : invitation à agir ; `neutral` ; `done` : tout est fait. */
  tone?: 'invite' | 'neutral' | 'done';
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={`${styles.badge} ${styles[tone]}`} aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <p className={styles.heading}>{title}</p>
      {text && <p className={styles.text}>{text}</p>}
      {action}
    </div>
  );
}
