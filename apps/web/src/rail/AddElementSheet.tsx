import type { Board, CreateElementInput, CustomModel } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import {
  DEFAULT_WIDTH,
  maxWidthAt,
  selectableKinds,
  type ElementKind,
} from '@tableau-clair/domain';
import { useState } from 'react';
import { PhotoField } from '../board-settings/PhotoField';
import { plural } from '../home/format';
import { useCustomModels, useRemoveCustomModel, useSaveCustomModel } from '../home/queries';
import { Alert, BottomSheet, Button, Stepper, TextField, TypeChip } from '../ui';
import { KIND_LABEL } from './appearance';
import styles from './AddElementSheet.module.css';
import type { SlotRef } from './RailRow';

/** Types proposés, dans l'ordre des maquettes ; « Autre appareil… » est traité à part. */
const STANDARD_KINDS: ElementKind[] = [
  'breaker',
  'rcd',
  'hphc_contactor',
  'impulse_relay',
  'surge_protector',
  'energy_meter',
  'connected_module',
  'relay',
  'spare',
];

/** Calibres courants proposés, selon le type (spec §6). */
const RATINGS: Partial<Record<ElementKind, number[]>> = {
  breaker: [10, 16, 20, 32],
  rcd: [25, 40, 63],
  hphc_contactor: [20, 25, 40, 63],
  impulse_relay: [16, 20, 25],
  relay: [16, 20, 25, 40],
};

type Choice = { type: 'kind'; kind: ElementKind } | { type: 'model'; model: CustomModel };

interface AddElementSheetProps {
  board: Board;
  slot: SlotRef | null;
  propertyId: string;
  busy: boolean;
  onClose: () => void;
  /** Crée l'appareil ; résout à vrai si l'ajout a réussi. */
  onSubmit: (rowId: string, input: CreateElementInput) => Promise<boolean>;
}

export function AddElementSheet(props: AddElementSheetProps) {
  const { slot } = props;
  if (!slot) return null;
  // Le formulaire repart de zéro à chaque module libre choisi.
  return <Form key={`${slot.rowIndex}-${slot.position}`} {...props} slot={slot} />;
}

function Form({
  board,
  slot,
  propertyId,
  busy,
  onClose,
  onSubmit,
}: AddElementSheetProps & { slot: SlotRef }) {
  const row = board.rows.find((r) => r.index === slot.rowIndex);
  const available = row ? maxWidthAt(row, slot.position) : 0;
  const kinds = row ? selectableKinds(row, slot.position) : [];
  const enabled = new Map(kinds.map((k) => [k.kind, k.enabled]));

  const models = useCustomModels();
  const saveModel = useSaveCustomModel();
  const removeModel = useRemoveCustomModel();

  const [choice, setChoice] = useState<Choice>({
    type: 'kind',
    kind: enabled.get('breaker')
      ? 'breaker'
      : (STANDARD_KINDS.find((k) => enabled.get(k)) ?? 'custom'),
  });
  const kind: ElementKind = choice.type === 'kind' ? choice.kind : 'custom';
  const isCustom = kind === 'custom';

  const [label, setLabel] = useState('');
  const [rating, setRating] = useState<number | null>(16);
  const [width, setWidth] = useState(() => Math.min(DEFAULT_WIDTH.breaker, available));
  const [role, setRole] = useState('');
  const [brand, setBrand] = useState('');
  const [reference, setReference] = useState('');
  const [keepModel, setKeepModel] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const ratings = RATINGS[kind];
  const needsLabel = kind !== 'spare';
  const trimmed = label.trim();
  const canSubmit =
    !!row && width >= 1 && width <= available && (!needsLabel || trimmed.length > 0);

  function chooseKind(next: ElementKind) {
    setChoice({ type: 'kind', kind: next });
    setWidth(Math.min(DEFAULT_WIDTH[next], available));
    setRating(RATINGS[next]?.includes(16) ? 16 : (RATINGS[next]?.[0] ?? null));
    setKeepModel(false);
    setError(undefined);
  }

  function chooseModel(model: CustomModel) {
    setChoice({ type: 'model', model });
    setLabel(model.label);
    setRole(model.role ?? '');
    setBrand(model.brand ?? '');
    setReference(model.model ?? '');
    setWidth(Math.min(model.width, available));
    setRating(null);
    setKeepModel(false);
    setError(undefined);
  }

  async function submit() {
    if (!row || !canSubmit) return;
    setError(undefined);
    setSaving(true);
    try {
      // Le modèle est enregistré en premier : un échec ici ne laisse pas d'appareil à moitié créé.
      if (isCustom && choice.type === 'kind' && keepModel) {
        await saveModel.mutateAsync({
          label: trimmed,
          role: role.trim() || null,
          brand: brand.trim() || null,
          model: reference.trim() || null,
          width,
        });
      }
      const created = await onSubmit(row.id, {
        position: slot.position,
        width,
        kind,
        label: kind === 'spare' ? trimmed || 'Réserve' : trimmed,
        ...(isCustom
          ? {
              role: role.trim() || null,
              brand: brand.trim() || null,
              model: reference.trim() || null,
            }
          : {}),
        ...(ratings && rating ? { ratingA: rating } : {}),
        ...(photoId ? { photoId } : {}),
      });
      if (created) onClose();
    } catch {
      setError("Le modèle n'a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const modules = (n: number) => `${n} ${plural(n, 'module', 'modules')}`;
  const savedModels = models.data ?? [];

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Ajouter un appareil"
      description={`Rangée ${slot.rowIndex + 1} · module ${slot.position + 1} · ${available} ${plural(
        available,
        'module disponible',
        'modules disponibles',
      )}`}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={!canSubmit || saving || busy}
            onClick={() => void submit()}
          >
            {saving ? 'Ajout…' : `Ajouter au module ${slot.position + 1}`}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div>
          <p className={styles.legend} id="add-type">
            Type
          </p>
          <div className={styles.chips} role="group" aria-labelledby="add-type">
            {STANDARD_KINDS.map((k) => {
              const ok = enabled.get(k) ?? false;
              return (
                <TypeChip
                  key={k}
                  label={KIND_LABEL[k]}
                  width={DEFAULT_WIDTH[k]}
                  variant={k === 'spare' ? 'dashed' : 'solid'}
                  selected={choice.type === 'kind' && choice.kind === k}
                  disabled={!ok}
                  disabledReason={`${modules(DEFAULT_WIDTH[k])} requis, ${available} disponible${available > 1 ? 's' : ''}`}
                  onClick={() => chooseKind(k)}
                />
              );
            })}
            <TypeChip
              label="Autre appareil…"
              variant="outline"
              selected={choice.type === 'kind' && choice.kind === 'custom'}
              onClick={() => chooseKind('custom')}
            />
          </div>
        </div>

        {savedModels.length > 0 && (
          <div>
            <p className={styles.legend} id="add-models">
              Mes modèles
            </p>
            <div className={styles.chips} role="group" aria-labelledby="add-models">
              {savedModels.map((model) => (
                <TypeChip
                  key={model.id}
                  label={model.label}
                  width={model.width}
                  selected={choice.type === 'model' && choice.model.id === model.id}
                  disabled={model.width > available}
                  disabledReason={`${modules(model.width)} requis, ${available} disponible${available > 1 ? 's' : ''}`}
                  onClick={() => chooseModel(model)}
                />
              ))}
            </div>
          </div>
        )}

        <TextField
          label={isCustom ? 'Nom' : 'Libellé'}
          value={label}
          maxLength={LIMITS.maxNameLength}
          placeholder={kind === 'spare' ? 'Réserve' : 'Ex. Prises garage'}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
        />

        {isCustom && (
          <div className={styles.custom}>
            <TextField
              label="Rôle"
              value={role}
              maxLength={LIMITS.maxNameLength}
              placeholder="Ex. Alimentation de la borne de recharge"
              autoComplete="off"
              onChange={(event) => setRole(event.target.value)}
            />
            <div className={styles.pair}>
              <TextField
                label="Marque"
                value={brand}
                maxLength={LIMITS.maxNameLength}
                autoComplete="off"
                onChange={(event) => setBrand(event.target.value)}
              />
              <TextField
                label="Modèle / référence"
                value={reference}
                maxLength={LIMITS.maxNameLength}
                autoComplete="off"
                onChange={(event) => setReference(event.target.value)}
              />
            </div>

            {choice.type === 'kind' ? (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={keepModel}
                  onChange={(event) => setKeepModel(event.target.checked)}
                />
                Enregistrer comme modèle réutilisable dans mon compte
              </label>
            ) : (
              <div>
                <Button
                  variant="danger-soft"
                  icon="trash"
                  disabled={removeModel.isPending}
                  onClick={() =>
                    removeModel.mutate(choice.model.id, { onSuccess: () => chooseKind('custom') })
                  }
                >
                  Supprimer ce modèle
                </Button>
              </div>
            )}
          </div>
        )}

        <div className={styles.pair}>
          {ratings && (
            <div className={styles.grow}>
              <p className={styles.legend} id="add-rating">
                Calibre (A)
              </p>
              <div className={styles.ratings} role="group" aria-labelledby="add-rating">
                {ratings.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={rating === value}
                    className={`${styles.rating} ${rating === value ? styles.ratingOn : ''}`}
                    onClick={() => setRating(rating === value ? null : value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className={styles.legend}>Largeur</p>
            <Stepper
              label="Largeur"
              value={width}
              min={1}
              max={Math.max(1, available)}
              unit={plural(width, 'module', 'modules')}
              onChange={setWidth}
            />
          </div>
        </div>
        {width >= available && available > 0 && (
          <p className={styles.hint}>
            Largeur maximale : le module suivant est occupé ou c’est le bout de la rangée.
          </p>
        )}

        <PhotoField
          propertyId={propertyId}
          photoId={photoId}
          usage="element"
          title="Photo de l'appareil"
          hint="Facultative. Redimensionnée, sans géolocalisation."
          onChange={(id) => setPhotoId(id)}
        />

        {error && <Alert>{error}</Alert>}
      </div>
    </BottomSheet>
  );
}
