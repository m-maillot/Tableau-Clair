import type { Board } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import { analyzeBoardResize } from '@tableau-clair/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ApiResponseError,
  createBoard,
  deletePhoto,
  NetworkError,
  updateBoard,
} from '../api/client';
import { plural } from '../home/format';
import { keys } from '../home/queries';
import { Alert, Button, IconButton, Stepper, TextArea, TextField } from '../ui';
import styles from './BoardForm.module.css';
import { DeleteSheet } from './DeleteSheet';
import { DuplicateSection } from './DuplicateSection';
import { modulesProblemMessage, rowsProblemMessage } from './messages';
import { OccupationList } from './OccupationList';
import { PhotoField } from './PhotoField';
import { RailPreview } from './RailPreview';
import sections from './Sections.module.css';

const DEFAULTS = { rowCount: 3, modulesPerRow: 24 } as const;

interface BoardFormProps {
  propertyId: string;
  propertyName: string;
  /** Absent : création d'un tableau. */
  board?: Board | undefined;
  onSaved: (board: Board) => void;
  onCancel: () => void;
  onDuplicated?: (copy: Board) => void;
  onDeleted?: () => void;
  /** Recharge le tableau après un conflit de version. */
  onReload?: () => void;
}

export function BoardForm({
  propertyId,
  propertyName,
  board,
  onSaved,
  onCancel,
  onDuplicated,
  onDeleted,
  onReload,
}: BoardFormProps) {
  const client = useQueryClient();
  const editing = board !== undefined;

  const [name, setName] = useState(board?.name ?? '');
  const [location, setLocation] = useState(board?.location ?? '');
  const [notes, setNotes] = useState(board?.notes ?? '');
  const [photoId, setPhotoId] = useState<string | null>(board?.photoId ?? null);
  const [rowCount, setRowCount] = useState(board?.rowCount ?? DEFAULTS.rowCount);
  const [modulesPerRow, setModulesPerRow] = useState(
    board?.modulesPerRow ?? DEFAULTS.modulesPerRow,
  );
  const [touched, setTouched] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Photos envoyées pendant l'édition : à supprimer si le formulaire est abandonné.
  const uploaded = useRef(new Set<string>());

  const analysis = useMemo(
    () =>
      analyzeBoardResize(
        (board?.rows ?? []).map((row) => ({ index: row.index, elements: row.elements })),
        { rowCount, modulesPerRow },
      ),
    [board, rowCount, modulesPerRow],
  );
  const modulesProblem = analysis.modules ? modulesProblemMessage(analysis.modules) : null;
  const rowsProblem = analysis.rows ? rowsProblemMessage(analysis.rows) : null;

  const nameError = touched && !name.trim() ? 'Le nom du tableau est obligatoire.' : undefined;

  const dirty =
    !editing ||
    name.trim() !== board.name ||
    (location.trim() || null) !== board.location ||
    (notes.trim() || null) !== board.notes ||
    photoId !== board.photoId ||
    rowCount !== board.rowCount ||
    modulesPerRow !== board.modulesPerRow;

  const save = useMutation({
    mutationFn: async (): Promise<Board> => {
      const fields = {
        name: name.trim(),
        location: location.trim() || null,
        notes: notes.trim() || null,
        photoId,
        rowCount,
        modulesPerRow,
      };
      return editing
        ? updateBoard(board.id, { ...fields, version: board.version })
        : createBoard(propertyId, fields);
    },
    onSuccess: async (saved) => {
      // La photo remplacée ou retirée n'est plus référencée : on la supprime du stockage.
      const previous = board?.photoId;
      if (previous && previous !== saved.photoId) void deletePhoto(previous).catch(() => undefined);
      uploaded.current.delete(saved.photoId ?? '');
      cleanupUploads();

      await Promise.all([
        client.invalidateQueries({ queryKey: keys.boards(propertyId) }),
        client.invalidateQueries({ queryKey: keys.overview(propertyId) }),
        client.invalidateQueries({ queryKey: keys.board(saved.id) }),
      ]);
      onSaved(saved);
    },
  });

  function cleanupUploads() {
    for (const id of uploaded.current) void deletePhoto(id).catch(() => undefined);
    uploaded.current.clear();
  }

  function onPhotoChange(next: string | null, wasUploaded?: boolean) {
    // Une photo envoyée puis remplacée avant l'enregistrement ne doit pas rester orpheline.
    if (photoId && uploaded.current.has(photoId)) {
      uploaded.current.delete(photoId);
      void deletePhoto(photoId).catch(() => undefined);
    }
    if (next && wasUploaded) uploaded.current.add(next);
    setPhotoId(next);
  }

  function cancel() {
    cleanupUploads();
    onCancel();
  }

  const hasProblem = !!(analysis.rows || analysis.modules);
  const canSave = name.trim().length > 0 && !hasProblem && dirty && !save.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (canSave) save.mutate();
  }

  // Message d'échec de l'enregistrement.
  const failure = save.error;
  const conflict = failure instanceof ApiResponseError && failure.status === 409;
  const serverRule =
    failure instanceof ApiResponseError &&
    (failure.code === 'capacity_below_content' || failure.code === 'row_not_empty');
  const network = failure instanceof NetworkError;

  const modulesDescribedBy = modulesProblem ? 'modules-problem' : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <IconButton label="Retour" icon="chevron-left" onClick={cancel} />
        <div className={styles.titles}>
          <h1 className={styles.title}>{editing ? 'Paramètres du tableau' : 'Nouveau tableau'}</h1>
          <p className={styles.subtitle}>{propertyName}</p>
        </div>
      </header>

      <div className={styles.columns}>
        <form id="board-form" onSubmit={onSubmit} noValidate className={styles.form}>
          <div className={styles.fields}>
            <TextField
              label="Nom"
              name="name"
              value={name}
              maxLength={LIMITS.maxNameLength}
              required
              autoComplete="off"
              placeholder="Tableau principal"
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              error={nameError}
            />
            <TextField
              label="Emplacement"
              name="location"
              value={location}
              maxLength={LIMITS.maxTextLength}
              autoComplete="off"
              placeholder="Garage, entrée, cave…"
              onChange={(event) => setLocation(event.target.value)}
            />

            <PhotoField propertyId={propertyId} photoId={photoId} onChange={onPhotoChange} />

            <section className={styles.composition} aria-labelledby="composition-title">
              <h2 id="composition-title" className={styles.legend}>
                Composition du coffret
              </h2>

              <div className={styles.setting}>
                <div>
                  <p className={styles.settingTitle}>Rangées</p>
                  <p className={styles.settingHint}>
                    {rowCount} {plural(rowCount, 'rangée', 'rangées')} de rail DIN
                  </p>
                </div>
                <Stepper
                  label="Rangées"
                  value={rowCount}
                  min={1}
                  max={LIMITS.maxBoardRows}
                  onChange={setRowCount}
                  invalid={!!rowsProblem}
                  describedBy={rowsProblem ? 'rows-problem' : undefined}
                />
              </div>
              {rowsProblem && (
                <Alert id="rows-problem">
                  <strong>{rowsProblem.title}</strong> {rowsProblem.body}
                </Alert>
              )}

              <div className={styles.setting}>
                <div>
                  <p className={styles.settingTitle}>Modules par rangée</p>
                  <p className={styles.settingHint}>1 module ≈ 17,5 mm</p>
                </div>
                <Stepper
                  label="Modules par rangée"
                  value={modulesPerRow}
                  min={1}
                  max={LIMITS.maxModulesPerRow}
                  unit="modules"
                  onChange={setModulesPerRow}
                  invalid={!!modulesProblem}
                  describedBy={modulesDescribedBy}
                />
              </div>
              {modulesProblem && (
                <Alert id="modules-problem">
                  <strong>{modulesProblem.title}</strong> {modulesProblem.body}
                </Alert>
              )}

              {editing && (
                <div className={styles.mobileOnly}>
                  <p className={styles.legend}>Occupation actuelle</p>
                  <OccupationList board={board} modulesPerRow={modulesPerRow} />
                </div>
              )}
            </section>

            <TextArea
              label="Notes"
              name="notes"
              value={notes}
              maxLength={LIMITS.maxTextLength}
              placeholder="Ex. Coffret d'origine, refait en 2019"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {conflict && (
            <Alert tone="warning">
              <strong>Ce tableau a été modifié depuis son ouverture.</strong> Rechargez-le pour voir
              la dernière version avant d'enregistrer.{' '}
              {onReload && (
                <button type="button" className={styles.link} onClick={onReload}>
                  Recharger
                </button>
              )}
            </Alert>
          )}
          {serverRule && (
            <Alert>Le serveur a refusé cette géométrie : la composition du tableau a changé.</Alert>
          )}
          {network && <Alert>Serveur injoignable. Vérifiez votre connexion, puis réessayez.</Alert>}
          {failure && !conflict && !serverRule && !network && (
            <Alert>L'enregistrement a échoué. Réessayez.</Alert>
          )}
        </form>

        {editing && (
          <div className={styles.side}>
            <section
              className={`${sections.card} ${styles.desktopOnly}`}
              aria-labelledby="preview-title"
            >
              <h2 id="preview-title" className={sections.title}>
                Aperçu à {modulesPerRow} modules
              </h2>
              <p className={sections.text}>Zone hachurée : hors rail après réduction.</p>
              <div className={styles.previewBody}>
                <RailPreview board={board} target={{ rowCount, modulesPerRow }} />
              </div>
            </section>

            <DuplicateSection board={board} onDuplicated={(copy) => onDuplicated?.(copy)} />

            <section
              className={`${sections.card} ${sections.danger}`}
              aria-labelledby="delete-title"
            >
              <h2 id="delete-title" className={`${sections.title} ${sections.dangerTitle}`}>
                Supprimer le tableau
              </h2>
              <p className={sections.text}>
                Supprime les rangées et leurs éléments. Les équipements du plan sont conservés.
              </p>
              <Button
                variant="danger-soft"
                icon="trash"
                className={styles.deleteButton}
                onClick={() => setDeleting(true)}
              >
                Supprimer le tableau…
              </Button>
            </section>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <Button variant="secondary" size="lg" onClick={cancel}>
          Annuler
        </Button>
        <Button type="submit" form="board-form" size="lg" fullWidth disabled={!canSave}>
          {save.isPending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le tableau'}
        </Button>
      </footer>

      {editing && (
        <DeleteSheet
          board={board}
          open={deleting}
          onClose={() => setDeleting(false)}
          onDeleted={() => onDeleted?.()}
        />
      )}
    </div>
  );
}
