import type { Element } from '@tableau-clair/contracts';
import { plural } from '../home/format';
import { BottomSheet, Button } from '../ui';
import { moduleRange } from './appearance';
import styles from './DeleteElementSheet.module.css';

interface DeleteElementSheetProps {
  element: Element | null;
  rowIndex: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteElementSheet({
  element,
  rowIndex,
  onConfirm,
  onClose,
}: DeleteElementSheetProps) {
  if (!element) return null;
  const linked = element.linkedFixtures;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Supprimer « ${element.label} » ?`}
      description={`Rangée ${rowIndex + 1} · ${moduleRange(element.position, element.width)}`}
      footer={
        <div className={styles.footer}>
          <Button variant="danger" size="lg" fullWidth onClick={onConfirm}>
            Supprimer
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            Annuler
          </Button>
        </div>
      }
    >
      <p className={styles.text}>
        Les modules libérés redeviennent disponibles. Vous pourrez annuler cette suppression juste
        après.
      </p>
      {linked > 0 && (
        <p className={styles.warning}>
          {linked}{' '}
          {plural(linked, 'équipement du plan est relié', 'équipements du plan sont reliés')} à cet
          appareil : {plural(linked, 'sa liaison passera', 'leurs liaisons passeront')} à « inconnue
          {linked > 1 ? 's' : ''} ».
        </p>
      )}
    </BottomSheet>
  );
}
