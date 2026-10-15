import styles from './Toast.module.css';

export interface ToastProps {
  tone: 'info' | 'error';
  children: string;
  /** Action de la notification (ex. « Réessayer » après un échec d'enregistrement). */
  action?: { label: string; onClick: () => void };
}

/**
 * Résultat d'une action, fixé en haut de l'écran pour rester visible même page défilée.
 * Un succès est annoncé poliment (`status`), un refus immédiatement (`alert`).
 */
export function Toast({ tone, children, action }: ToastProps) {
  return (
    <div className={styles.region}>
      <p
        role={tone === 'error' ? 'alert' : 'status'}
        className={`${styles.toast} ${tone === 'error' ? styles.error : ''}`}
      >
        {children}
        {action && (
          <button type="button" className={styles.action} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </p>
    </div>
  );
}
