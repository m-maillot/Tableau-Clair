import { BottomSheet, Button } from '../ui';
import styles from './ConflictSheet.module.css';

export interface ConflictRow {
  label: string;
  mine: string;
  saved: string;
}

export interface Conflict {
  /** Ce qui est en conflit : « Prise four », « Cuisine »… */
  subject: string;
  rows: ConflictRow[];
  /** Version enregistrée par quelqu'un d'autre. */
  savedVersion: number;
  savedAt: string | null;
  /** Remplace la version enregistrée par la mienne. */
  keep: () => void;
  /** Abandonne mes modifications au profit de la version enregistrée. */
  reload: () => void;
}

interface ConflictSheetProps {
  conflict: Conflict | null;
  busy?: boolean;
  /** « Décider plus tard » : la feuille se ferme, la version enregistrée est affichée. */
  onLater: () => void;
}

const timeOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

/** Conflit d'édition : versions côte à côte, champ par champ, sans fusion automatique. */
export function ConflictSheet({ conflict, busy = false, onLater }: ConflictSheetProps) {
  if (!conflict) return null;
  const when = timeOf(conflict.savedAt);

  return (
    <BottomSheet
      open
      onClose={onLater}
      title="Cet élément a été modifié entre-temps"
      description={`« ${conflict.subject} » · version enregistrée n° ${conflict.savedVersion}${when ? `, ${when}` : ''}`}
      footer={
        <div className={styles.footer}>
          <Button size="lg" fullWidth disabled={busy} onClick={conflict.keep}>
            Garder ma version
          </Button>
          <p className={styles.consequence}>Remplace la version enregistrée par la vôtre.</p>
          <Button size="lg" variant="secondary" fullWidth disabled={busy} onClick={conflict.reload}>
            Recharger la version enregistrée
          </Button>
          <p className={styles.consequence}>Abandonne vos modifications.</p>
          <Button size="lg" variant="ghost" fullWidth disabled={busy} onClick={onLater}>
            Décider plus tard
          </Button>
        </div>
      }
    >
      {conflict.rows.length === 0 ? (
        <p className={styles.same}>
          Les champs que vous modifiez sont identiques ; seule la version a changé.
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Champ</th>
              <th scope="col">Ma valeur</th>
              <th scope="col">Enregistrée</th>
            </tr>
          </thead>
          <tbody>
            {conflict.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className={styles.mine}>{row.mine}</td>
                <td className={styles.saved}>{row.saved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </BottomSheet>
  );
}
