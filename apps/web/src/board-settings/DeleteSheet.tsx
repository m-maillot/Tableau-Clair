import type { Board } from '@tableau-clair/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteBoard, fetchBoard } from '../api/client';
import { plural } from '../home/format';
import { keys, useBoardImpact } from '../home/queries';
import { Alert, BottomSheet, Button, Icon, TextField } from '../ui';
import { downloadBoard } from './export';
import styles from './DeleteSheet.module.css';

interface DeleteSheetProps {
  board: Board;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteSheet({ board, open, onClose, onDeleted }: DeleteSheetProps) {
  const client = useQueryClient();
  const impact = useBoardImpact(board.id, open);
  const [typed, setTyped] = useState('');
  const [exportFailed, setExportFailed] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteBoard(board.id),
    onSuccess: async () => {
      client.removeQueries({ queryKey: keys.board(board.id) });
      await client.invalidateQueries({ queryKey: keys.boards(board.propertyId) });
      await client.invalidateQueries({ queryKey: keys.overview(board.propertyId) });
      onDeleted();
    },
  });

  const confirmed = typed.trim() === board.name.trim();

  async function onExport() {
    setExportFailed(false);
    try {
      downloadBoard(await fetchBoard(board.id));
    } catch {
      setExportFailed(true);
    }
  }

  const close = () => {
    setTyped('');
    remove.reset();
    onClose();
  };

  const data = impact.data;
  const elementLabel = (n: number) => plural(n, 'élément', 'éléments');

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={`Supprimer « ${board.name} » ?`}
      description="Cette action est définitive."
      footer={
        <div className={styles.footer}>
          <Button
            variant="danger"
            size="lg"
            fullWidth
            disabled={!confirmed || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={close}>
            Annuler
          </Button>
        </div>
      }
    >
      <div className={styles.summary}>
        {impact.isPending && (
          <p role="status" className={styles.muted}>
            Calcul de l'impact…
          </p>
        )}
        {impact.isError && (
          <p role="alert" className={styles.muted}>
            Impossible de calculer l'impact. Vous pouvez tout de même supprimer le tableau.
          </p>
        )}
        {data && (
          <>
            <h3 className={styles.label}>Ce qui sera supprimé</h3>
            <ul className={styles.list}>
              <li>
                {data.rowCount} {plural(data.rowCount, 'rangée', 'rangées')} et {data.elementCount}{' '}
                {elementLabel(data.elementCount)} du rail
              </li>
              {data.hasPhoto && <li>La photo du tableau</li>}
            </ul>
            <h3 className={styles.label}>Ce qui est conservé</h3>
            <ul className={styles.list}>
              <li>Les équipements du plan ({data.fixtureCount})</li>
              <li>
                Leurs liaisons passent à « inconnue » : {data.fixturesToUnlink}{' '}
                {plural(
                  data.fixturesToUnlink,
                  'équipement deviendra « à identifier »',
                  'équipements deviendront « à identifier »',
                )}
              </li>
            </ul>
          </>
        )}
      </div>

      <button type="button" className={styles.export} onClick={() => void onExport()}>
        <Icon name="download" size={18} strokeWidth={2.4} />
        Exporter ce tableau avant (JSON)
      </button>
      {exportFailed && (
        <p role="alert" className={styles.exportError}>
          L'export a échoué. Réessayez avant de supprimer.
        </p>
      )}

      <TextField
        label="Saisissez le nom du tableau pour confirmer"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={board.name}
        autoComplete="off"
        className={styles.confirm}
      />

      {remove.isError && <Alert>La suppression a échoué. Réessayez.</Alert>}
    </BottomSheet>
  );
}
