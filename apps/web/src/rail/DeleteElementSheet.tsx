import type { Element } from '@tableau-clair/contracts';
import { plural } from '../home/format';
import { useBreakerCircuit } from '../home/queries';
import { BottomSheet, Button, Icon } from '../ui';
import { appearanceOf } from './appearance';
import styles from './DeleteElementSheet.module.css';

interface DeleteElementSheetProps {
  element: Element | null;
  rowIndex: number;
  onConfirm: () => void;
  onClose: () => void;
}

/** Équipements cités nommément ; les autres sont résumés (« + 2 autres »). */
const LISTED = 2;

export function DeleteElementSheet(props: DeleteElementSheetProps) {
  if (!props.element) return null;
  return <Content {...props} element={props.element} />;
}

function Content({
  element,
  rowIndex,
  onConfirm,
  onClose,
}: DeleteElementSheetProps & { element: Element }) {
  const look = appearanceOf(element);
  const linked = element.linkedFixtures;
  const circuit = useBreakerCircuit(
    linked > 0 && element.kind === 'breaker' ? element.id : undefined,
  );
  const fixtures = circuit.data?.fixtures ?? [];
  const where = `Rangée ${rowIndex + 1} · module ${element.position + 1}`;
  const identity = [
    look.kindLabel,
    element.ratingA ? `${element.ratingA} A` : null,
    where.toLowerCase().replace('rangée', 'rangée'),
  ]
    .filter(Boolean)
    .join(' · ');
  const freed =
    element.width > 1
      ? `Les modules ${element.position + 1} à ${element.position + element.width} de la rangée ${rowIndex + 1} deviennent libres`
      : `Le module ${element.position + 1} de la rangée ${rowIndex + 1} devient libre`;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Supprimer « ${element.label} » ?`}
      description={identity}
      footer={
        <div className={styles.footer}>
          <Button variant="danger" size="lg" fullWidth onClick={onConfirm}>
            Supprimer l’appareil
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            Annuler
          </Button>
        </div>
      }
    >
      <section className={styles.changes} aria-label="Ce qui change">
        <p className={styles.label}>Ce qui change</p>
        <ul className={styles.list}>
          <li>{freed}</li>
          {linked > 0 && (
            <li>
              {linked}{' '}
              {plural(
                linked,
                'équipement perd son disjoncteur et passe à « inconnue »',
                'équipements perdent leur disjoncteur et passent à « inconnue »',
              )}
            </li>
          )}
        </ul>

        {linked > 0 && (
          <>
            <p className={styles.label}>Équipements concernés</p>
            {circuit.isPending ? (
              <p className={styles.muted}>Chargement…</p>
            ) : (
              <ul className={styles.fixtures}>
                {fixtures.slice(0, LISTED).map((f) => (
                  <li key={f.id} className={styles.fixture}>
                    <span className={styles.fixtureName}>{f.label}</span>
                    <span className={styles.muted}>{f.roomName}</span>
                  </li>
                ))}
                {fixtures.length > LISTED && (
                  <li className={styles.more}>+ {fixtures.length - LISTED} autres</li>
                )}
              </ul>
            )}
          </>
        )}
      </section>

      <div className={styles.warning}>
        <Icon name="warning" size={20} strokeWidth={2.2} />
        <p>
          {linked > 0
            ? 'Les équipements restent sur le plan et apparaîtront dans « À vérifier ». Aucun n’est supprimé.'
            : 'Les modules libérés redeviennent disponibles. Vous pourrez annuler cette suppression juste après.'}
        </p>
      </div>
    </BottomSheet>
  );
}
