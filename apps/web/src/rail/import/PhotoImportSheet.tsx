import type { Board, PhotoAnalysisResponse, Quota } from '@tableau-clair/contracts';
import { ELEMENT_KINDS, type ElementKind } from '@tableau-clair/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeBoardPhoto,
  ApiResponseError,
  bulkCreateElements,
  NetworkError,
} from '../../api/client';
import { plural } from '../../home/format';
import { keys, useAiQuota } from '../../home/queries';
import { Alert, BottomSheet, Button, Icon } from '../../ui';
import { KIND_LABEL } from '../appearance';
import styles from './PhotoImportSheet.module.css';
import { findConflicts, initialItems, selectedItems, toBulkInput, type ReviewItem } from './review';

type Phase = 'pick' | 'analyzing' | 'review';

interface PhotoImportSheetProps {
  board: Board;
  open: boolean;
  onClose: () => void;
  /** Appelé une fois les appareils ajoutés. */
  onImported: (count: number) => void;
}

const resetTime = (quota: Pick<Quota, 'resetsAt'>) =>
  new Date(quota.resetsAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

export const remainingLabel = (quota: Quota) =>
  quota.remaining === 0
    ? `Limite atteinte (${quota.limit} analyses par jour). Prochaine analyse demain à ${resetTime(quota)}.`
    : `Il vous reste ${quota.remaining} ${plural(quota.remaining, 'analyse', 'analyses')} aujourd’hui.`;

function analysisError(error: unknown): { text: string; quota?: Quota } {
  if (error instanceof NetworkError) {
    return { text: 'Serveur injoignable. Vérifiez votre connexion, puis réessayez.' };
  }
  if (error instanceof ApiResponseError) {
    const quota = error.details as Quota | undefined;
    switch (error.code) {
      case 'quota_exceeded':
        return { text: 'Vous avez utilisé toutes vos analyses du jour.', quota };
      case 'analysis_in_progress':
        return { text: 'Une analyse est déjà en cours. Attendez son résultat.', quota };
      case 'analysis_failed':
        return {
          text: 'L’analyse a échoué. Rien n’a été modifié et cette tentative n’est pas décomptée. Réessayez.',
          quota,
        };
      case 'analysis_disabled':
        return { text: 'L’analyse de photo n’est pas activée sur ce serveur.' };
      case 'unsupported_format':
        return { text: 'Format non pris en charge : utilisez une image JPEG, PNG ou WebP.' };
      case 'invalid_image':
      case 'image_too_large':
        return { text: 'Ce fichier ne semble pas être une image lisible.' };
    }
    if (error.status === 413) return { text: 'Image trop volumineuse (15 Mo au maximum).' };
    if (error.status === 403) return { text: 'Vous n’avez pas le droit de modifier ce tableau.' };
  }
  return { text: 'L’analyse a échoué. Réessayez dans un instant.' };
}

const CONFLICT_TEXT = {
  overlap: 'Chevauche un autre appareil : modifiez la position ou décochez-le.',
  out_of_bounds: 'Dépasse la rangée : modifiez la position ou la largeur, ou décochez-le.',
} as const;

export function PhotoImportSheet(props: PhotoImportSheetProps) {
  // L'état repart de zéro à chaque ouverture.
  if (!props.open) return null;
  return <Content {...props} />;
}

function Content({ board, onClose, onImported }: PhotoImportSheetProps) {
  const queryClient = useQueryClient();
  const quotaQuery = useAiQuota();
  const quota = quotaQuery.data;
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<PhotoAnalysisResponse>();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [applying, setApplying] = useState(false);

  // Une réponse qui arrive après la fermeture de la feuille est ignorée.
  useEffect(
    () => () => {
      closed.current = true;
    },
    [],
  );
  useEffect(() => {
    if (!file) return setPreview(undefined);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const conflicts = useMemo(() => findConflicts(items, board.rows), [items, board.rows]);
  const selected = useMemo(() => selectedItems(items, conflicts), [items, conflicts]);

  const setQuota = (next: Quota) => queryClient.setQueryData(keys.aiQuota, next);

  async function analyze() {
    if (!file) return;
    setError(undefined);
    setPhase('analyzing');
    try {
      const response = await analyzeBoardPhoto(board.id, file);
      if (closed.current) return;
      setQuota(response.quota);
      setResult(response);
      setItems(initialItems(response));
      setPhase('review');
    } catch (problem) {
      if (closed.current) return;
      const { text, quota: fresh } = analysisError(problem);
      if (fresh) setQuota(fresh);
      else void queryClient.invalidateQueries({ queryKey: keys.aiQuota });
      setError(text);
      setPhase('pick');
    }
  }

  async function apply() {
    setError(undefined);
    setApplying(true);
    try {
      await bulkCreateElements(board.id, toBulkInput(selected));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.board(board.id) }),
        queryClient.invalidateQueries({ queryKey: keys.boards(board.propertyId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(board.propertyId) }),
      ]);
      onImported(selected.length);
    } catch (problem) {
      // Le tableau a peut-être changé entre-temps : on le recharge pour recalculer les conflits.
      void queryClient.invalidateQueries({ queryKey: keys.board(board.id) });
      const index = (problem as ApiResponseError).details as { index?: number } | undefined;
      const culprit = typeof index?.index === 'number' ? selected[index.index] : undefined;
      setError(
        problem instanceof NetworkError
          ? 'Serveur injoignable. Rien n’a été ajouté : vérifiez votre connexion, puis réessayez.'
          : culprit
            ? `« ${culprit.element.label} » ne peut pas être ajouté (le tableau a changé). Rien n’a été ajouté : vérifiez la liste, puis réessayez.`
            : 'L’ajout a échoué. Rien n’a été ajouté, réessayez.',
      );
    } finally {
      setApplying(false);
    }
  }

  const update = (key: string, change: Partial<ReviewItem['element']> | { checked: boolean }) =>
    setItems((current) =>
      current.map((item) =>
        item.key !== key
          ? item
          : 'checked' in change
            ? { ...item, checked: change.checked }
            : { ...item, element: { ...item.element, ...change } },
      ),
    );

  const pick = (chosen: File | undefined) => {
    if (chosen) {
      setFile(chosen);
      setError(undefined);
    }
  };

  const exhausted = quota?.enabled && quota.remaining === 0;

  // --- Choix de la photo --------------------------------------------------------------------------------
  if (phase === 'pick' || phase === 'analyzing') {
    const busy = phase === 'analyzing';
    return (
      <BottomSheet
        open
        onClose={onClose}
        title="Remplir depuis une photo"
        description={`Tableau « ${board.name} »`}
        footer={
          <Button
            size="lg"
            fullWidth
            disabled={!file || busy || !!exhausted}
            onClick={() => void analyze()}
          >
            {busy
              ? 'Analyse en cours…'
              : quota?.enabled
                ? `Analyser (${quota.used + 1} sur ${quota.limit} aujourd’hui)`
                : 'Analyser'}
          </Button>
        }
      >
        <div className={styles.stack}>
          {error && <Alert>{error}</Alert>}
          <ul className={styles.tips}>
            <li>Retirez le cache du tableau et photographiez-le de face.</li>
            <li>Gardez tout le tableau dans le cadre, sans flash ni reflet.</li>
            <li>Vous pourrez corriger chaque appareil avant de l’ajouter.</li>
          </ul>

          {preview && (
            <img src={preview} alt="Photo du tableau à analyser" className={styles.preview} />
          )}

          <div className={styles.choose}>
            <input
              ref={camera}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(event) => pick(event.target.files?.[0])}
            />
            <input
              ref={files}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => pick(event.target.files?.[0])}
            />
            <Button
              variant="secondary"
              icon="camera"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              Prendre une photo
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => files.current?.click()}>
              {file ? 'Changer de photo' : 'Choisir un fichier'}
            </Button>
          </div>

          {busy && (
            <p role="status" className={styles.progress}>
              Analyse en cours, cela prend environ une minute. Vous pouvez fermer cette fenêtre :
              l’analyse est déjà décomptée.
            </p>
          )}
          {quota?.enabled && (
            <p className={exhausted ? styles.exhausted : styles.note}>{remainingLabel(quota)}</p>
          )}
          <p className={styles.note}>
            La photo est envoyée à Anthropic pour analyse. Tableau Clair ne la conserve pas.
          </p>
        </div>
      </BottomSheet>
    );
  }

  // --- Relecture ----------------------------------------------------------------------------------------------
  const rowsInProposal = [...new Set(items.map((item) => item.rowIndex))].sort((a, b) => a - b);
  const mismatch = result?.detectedGeometry;
  const differs =
    mismatch &&
    (mismatch.rowCount !== board.rows.length || mismatch.modulesPerRow !== board.modulesPerRow);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Vérifiez la proposition"
      description={
        items.length === 0
          ? 'Aucun appareil reconnu'
          : `${items.length} ${plural(items.length, 'appareil proposé', 'appareils proposés')}`
      }
      footer={
        <>
          <Button variant="secondary" disabled={applying} onClick={() => setPhase('pick')}>
            Recommencer
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={selected.length === 0 || applying}
            onClick={() => void apply()}
          >
            {applying
              ? 'Ajout…'
              : selected.length === 0
                ? 'Aucun appareil à ajouter'
                : `Ajouter ${selected.length} ${plural(selected.length, 'appareil', 'appareils')}`}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        {error && <Alert>{error}</Alert>}
        {items.length === 0 && (
          <Alert tone="warning">
            Nous n’avons reconnu aucun appareil. Vérifiez que le cache est retiré, que le tableau
            est bien cadré et éclairé, puis recommencez.
          </Alert>
        )}
        {result && result.remarks.length > 0 && (
          <Alert tone="warning">
            <ul className={styles.remarks}>
              {result.remarks.map((remark) => (
                <li key={remark}>{remark}</li>
              ))}
            </ul>
          </Alert>
        )}
        {differs && (
          <p className={styles.note}>
            La photo semble montrer {mismatch.rowCount}{' '}
            {plural(mismatch.rowCount, 'rangée', 'rangées')} de {mismatch.modulesPerRow} modules ;
            ce tableau a {board.rows.length} {plural(board.rows.length, 'rangée', 'rangées')} de{' '}
            {board.modulesPerRow} modules.
          </p>
        )}

        {rowsInProposal.map((rowIndex) => (
          <section key={rowIndex} aria-label={`Rangée ${rowIndex + 1}`} className={styles.group}>
            <h3 className={styles.groupTitle}>Rangée {rowIndex + 1}</h3>
            {items
              .filter((item) => item.rowIndex === rowIndex)
              .sort((a, b) => a.element.position - b.element.position)
              .map((item) => {
                const conflict = conflicts.get(item.key);
                const name = item.element.label;
                return (
                  <article
                    key={item.key}
                    className={`${styles.item} ${item.checked && !conflict ? '' : styles.off}`}
                  >
                    <div className={styles.itemHead}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) => update(item.key, { checked: event.target.checked })}
                        />
                        <span>Ajouter « {name} »</span>
                      </label>
                      {item.element.confidence === 'low' && (
                        <span className={styles.verify}>
                          <Icon name="warning" size={16} strokeWidth={2.4} aria-hidden="true" />À
                          vérifier
                        </span>
                      )}
                    </div>
                    <div className={styles.fields}>
                      <label className={styles.field}>
                        <span>Type</span>
                        <select
                          value={item.element.kind}
                          onChange={(event) =>
                            update(item.key, { kind: event.target.value as ElementKind })
                          }
                        >
                          {ELEMENT_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {KIND_LABEL[kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`${styles.field} ${styles.wide}`}>
                        <span>Libellé</span>
                        <input
                          value={item.element.label}
                          maxLength={120}
                          onChange={(event) => update(item.key, { label: event.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Calibre (A)</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={item.element.ratingA ?? ''}
                          onChange={(event) =>
                            update(item.key, {
                              ratingA: event.target.value ? Number(event.target.value) : undefined,
                            })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Module</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          defaultValue={item.element.position + 1}
                          onChange={(event) => {
                            // Un champ vidé en cours de frappe ne déplace pas l'appareil.
                            const value = Number(event.target.value);
                            if (event.target.value && Number.isInteger(value) && value >= 1) {
                              update(item.key, { position: value - 1 });
                            }
                          }}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Largeur</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          defaultValue={item.element.width}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (event.target.value && Number.isInteger(value) && value >= 1) {
                              update(item.key, { width: value });
                            }
                          }}
                        />
                      </label>
                    </div>
                    {conflict && (
                      <p role="alert" className={styles.conflict}>
                        <Icon name="alert-circle" size={16} strokeWidth={2.4} aria-hidden="true" />
                        {CONFLICT_TEXT[conflict]}
                      </p>
                    )}
                  </article>
                );
              })}
          </section>
        ))}
      </div>
    </BottomSheet>
  );
}
