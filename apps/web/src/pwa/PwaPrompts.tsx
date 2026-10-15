import { useState } from 'react';
import { BottomSheet, Button } from '../ui';
import banner from '../shell/Banner.module.css';
import {
  applyUpdate,
  dismissInstall,
  installDismissed,
  needsIosHint,
  promptInstall,
  usePwa,
} from './pwa';
import styles from './PwaPrompts.module.css';

/** Bannière « Nouvelle version disponible » et invite d'installation. */
export function PwaPrompts() {
  const { updateReady, canInstall } = usePwa();
  const [hidden, setHidden] = useState(() => installDismissed());
  const iosHint = needsIosHint();
  const showInstall = !hidden && (canInstall || iosHint);

  return (
    <>
      {updateReady && (
        <section className={`${banner.banner} ${banner.update}`} aria-label="Mise à jour">
          <div className={banner.text}>
            <strong>Nouvelle version disponible</strong>
            <span>Rechargez pour profiter des dernières améliorations.</span>
          </div>
          <Button size="md" onClick={applyUpdate}>
            Mettre à jour
          </Button>
        </section>
      )}

      <BottomSheet
        open={showInstall}
        onClose={() => {
          dismissInstall();
          setHidden(true);
        }}
        title="Installer Tableau Clair"
        description="Un accès direct depuis l’écran d’accueil, même devant le tableau."
        footer={
          <div className={styles.footer}>
            {canInstall && (
              <Button
                size="lg"
                fullWidth
                onClick={() =>
                  void promptInstall().then(() => {
                    dismissInstall();
                    setHidden(true);
                  })
                }
              >
                Installer
              </Button>
            )}
            <Button
              size="lg"
              variant="secondary"
              fullWidth
              onClick={() => {
                dismissInstall();
                setHidden(true);
              }}
            >
              Plus tard
            </Button>
          </div>
        }
      >
        <ul className={styles.list}>
          <li>Ouverture en plein écran, comme une application.</li>
          <li>Dernier état consultable sans réseau, en lecture seule.</li>
        </ul>
        {iosHint && !canInstall && (
          <p className={styles.hint}>
            Sur iPhone : touchez <strong>Partager</strong>, puis{' '}
            <strong>Sur l’écran d’accueil</strong>.
          </p>
        )}
      </BottomSheet>
    </>
  );
}
