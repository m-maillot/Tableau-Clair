import styles from './Toast.module.css';

export interface ToastProps {
  tone: 'info' | 'error';
  children: string;
}

/**
 * Résultat d'une action, fixé en haut de l'écran pour rester visible même page défilée.
 * Un succès est annoncé poliment (`status`), un refus immédiatement (`alert`).
 */
export function Toast({ tone, children }: ToastProps) {
  return (
    <div className={styles.region}>
      <p
        role={tone === 'error' ? 'alert' : 'status'}
        className={`${styles.toast} ${tone === 'error' ? styles.error : ''}`}
      >
        {children}
      </p>
    </div>
  );
}
