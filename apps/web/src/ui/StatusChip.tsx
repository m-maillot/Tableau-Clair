import type { Verification } from '@tableau-clair/domain';
import { Icon, type IconName } from './Icon';
import styles from './StatusChip.module.css';

const STATUS: Record<Verification, { label: string; icon: IconName }> = {
  verified: { label: 'Vérifiée', icon: 'check' },
  assumed: { label: 'Supposée', icon: 'wave' },
  unknown: { label: 'Inconnue', icon: 'help' },
};

export interface StatusChipProps {
  status: Verification;
  /** Remplace le libellé par défaut (ex. « À identifier »). */
  label?: string;
}

/** Statut d'une liaison : couleur + icône + libellé, jamais la couleur seule. */
export function StatusChip({ status, label }: StatusChipProps) {
  const { label: defaultLabel, icon } = STATUS[status];
  return (
    <span className={`${styles.chip} ${styles[status]}`} data-status={status}>
      <Icon name={icon} size={14} strokeWidth={status === 'verified' ? 3 : 2.6} />
      {label ?? defaultLabel}
    </span>
  );
}
