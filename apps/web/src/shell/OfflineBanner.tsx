import { useLastSync, useOnline } from '../net/status';
import { Icon } from '../ui';
import styles from './OfflineBanner.module.css';

/** Bandeau « Hors ligne · lecture seule » avec l'heure du dernier état chargé (spec §10). */
export function OfflineBanner() {
  const online = useOnline();
  const lastSync = useLastSync();
  if (online) return null;

  const time = lastSync?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div role="status" className={styles.banner}>
      <Icon name="wifi-off" size={20} strokeWidth={2.4} />
      <div>
        <strong>Hors ligne · lecture seule</strong>
        <span className={styles.sub}>
          {time ? `Dernier état chargé à ${time}. ` : ''}Les modifications reviendront avec la
          connexion.
        </span>
      </div>
    </div>
  );
}
