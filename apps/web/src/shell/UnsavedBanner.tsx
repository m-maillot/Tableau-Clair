import { useState } from 'react';
import { plural } from '../home/format';
import { discardUnsaved, replayUnsaved, useUnsaved } from '../net/unsaved';
import { Button } from '../ui';
import styles from './Banner.module.css';

/** Modifications gardées sur l'appareil après une session expirée : réappliquer ou ignorer. */
export function UnsavedBanner() {
  const unsaved = useUnsaved();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  if (unsaved.length === 0) return null;
  const n = unsaved.length;

  return (
    <section className={styles.banner} aria-label="Modifications non enregistrées">
      <div className={styles.text}>
        <strong>
          {n} {plural(n, 'modification non enregistrée', 'modifications non enregistrées')}
        </strong>
        <span>
          Gardée{n > 1 ? 's' : ''} sur cet appareil quand votre session a expiré.
          {failed > 0
            ? ` ${failed} n’${failed > 1 ? 'ont' : 'a'} pas pu être réappliquée${failed > 1 ? 's' : ''} (modifiée${failed > 1 ? 's' : ''} entre-temps).`
            : ''}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          size="md"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void replayUnsaved()
              .then((rest) => setFailed(rest.length))
              .finally(() => setBusy(false));
          }}
        >
          Réappliquer
        </Button>
        <Button size="md" variant="secondary" disabled={busy} onClick={() => discardUnsaved()}>
          Ignorer
        </Button>
      </div>
    </section>
  );
}
