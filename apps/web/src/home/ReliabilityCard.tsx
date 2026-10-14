import type { Overview } from '@tableau-clair/contracts';
import { Icon } from '../ui';
import { lastModifiedLabel, plural } from './format';
import styles from './ReliabilityCard.module.css';

export function ReliabilityCard({ overview, now }: { overview: Overview; now?: Date }) {
  const { total, verified, assumed, unknown } = overview.reliability;
  const modified = lastModifiedLabel(overview.lastModified, now);

  return (
    <section className={styles.card} aria-labelledby="reliability-title">
      <div className={styles.header}>
        <h2 id="reliability-title" className={styles.title}>
          Fiabilité du repérage
        </h2>
        {modified && <p className={styles.modified}>{modified}</p>}
      </div>

      {total === 0 ? (
        <p className={styles.empty}>
          Aucun équipement sur le plan pour l'instant. Ajoutez prises et luminaires pour suivre la
          fiabilité du repérage.
        </p>
      ) : (
        <>
          <div className={styles.figures}>
            <div className={styles.figure}>
              <Icon name="bolt" size={30} />
              <div>
                <p className={styles.label}>Vérifiés</p>
                <p className={styles.value}>
                  {verified} <span className={styles.total}>/ {total}</span>
                </p>
              </div>
            </div>
            <div className={styles.figureRight}>
              <p className={styles.label}>À identifier</p>
              <p className={styles.value}>
                {unknown}{' '}
                <span className={styles.total}>{plural(unknown, 'équipement', 'équipements')}</span>
              </p>
            </div>
          </div>

          {/* Les valeurs sont dites en texte dans la légende : la barre n'est qu'un résumé visuel. */}
          <div className={styles.bar} aria-hidden="true">
            {verified > 0 && <span className={styles.verified} style={{ flex: verified }} />}
            {assumed > 0 && <span className={styles.assumed} style={{ flex: assumed }} />}
            {unknown > 0 && <span className={styles.unknown} style={{ flex: unknown }} />}
          </div>
          <ul className={styles.legend}>
            <li>
              <span className={`${styles.dot} ${styles.verified}`} aria-hidden="true" /> Vérifiée{' '}
              {verified}
            </li>
            <li>
              <span className={`${styles.dot} ${styles.assumed}`} aria-hidden="true" /> Supposée{' '}
              {assumed}
            </li>
            <li>
              <span className={`${styles.dot} ${styles.unknown}`} aria-hidden="true" /> Inconnue{' '}
              {unknown}
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
