import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Sous-titre (ex. « Rangée 1 · module 21 · 4 modules disponibles »). */
  description?: string;
  children: ReactNode;
  /** Pied de feuille : actions principales. */
  footer?: ReactNode;
  /**
   * `true` (défaut) : feuille modale avec fond, focus piégé et fermeture par Échap.
   * `false` : feuille persistante qui n'empêche pas d'agir sur le reste de l'écran
   * (feuille de détail de l'éditeur).
   */
  modal?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  modal = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Focus : on entre dans la feuille à l'ouverture et on rend le focus à la fermeture.
  useEffect(() => {
    if (!open || !modal) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => previous?.focus?.();
  }, [open, modal]);

  // Une feuille modale fige le défilement de la page.
  useEffect(() => {
    if (!open || !modal) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open, modal]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (!modal || event.key !== 'Tab') return;

    // Piège à focus : Tab et Maj+Tab restent dans la feuille.
    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheetRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const sheet = (
    <div
      ref={sheetRef}
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      className={`${styles.sheet} ${modal ? '' : styles.persistent}`}
      onKeyDown={onKeyDown}
    >
      <div className={styles.handle} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
        </div>
        <IconButton label="Fermer" icon="close" onClick={onClose} />
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );

  if (!modal) return sheet;

  return createPortal(
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      {sheet}
    </div>,
    document.body,
  );
}
