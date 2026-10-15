import type { Board, Element } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import {
  maxWidthAt,
  validateSpan,
  type Curve,
  type ElementKind,
  type RcdType,
} from '@tableau-clair/domain';
import { useMemo, useState } from 'react';
import { PhotoField } from '../board-settings/PhotoField';
import { plural } from '../home/format';
import { useBreakerCircuit } from '../home/queries';
import { BottomSheet, Button, Icon, IconButton, Stepper, TextArea, TextField } from '../ui';
import { appearanceOf, moduleRange } from './appearance';
import type { ElementChanges } from './history';
import styles from './EditElementSheet.module.css';

/** Champs affichés selon le type (spec §6) ; les champs communs s'affichent toujours. */
const RATED: ElementKind[] = ['breaker', 'rcd', 'hphc_contactor', 'impulse_relay', 'relay'];
const RATINGS: Partial<Record<ElementKind, number[]>> = {
  breaker: [10, 16, 20, 25, 32],
  rcd: [25, 40, 63],
  hphc_contactor: [20, 25, 40, 63],
  impulse_relay: [16, 20, 25],
  relay: [16, 20, 25, 40],
};
const WITH_POLES: ElementKind[] = ['breaker', 'rcd', 'surge_protector'];
const WITH_CABLES: ElementKind[] = [
  'breaker',
  'hphc_contactor',
  'impulse_relay',
  'relay',
  'custom',
];
const SECTIONS = [1.5, 2.5, 4, 6, 10];
const SENSITIVITIES = [10, 30, 100, 300, 500];
const CURVES: Curve[] = ['B', 'C', 'D'];
const RCD_TYPES: RcdType[] = ['AC', 'A', 'F', 'B'];
const POLES = [
  { value: 1, label: '1P+N' },
  { value: 2, label: '2P' },
  { value: 3, label: '3P' },
  { value: 4, label: '4P' },
];

const fr = (n: number) => String(n).replace('.', ',');

interface EditElementSheetProps {
  board: Board;
  element: Element | null;
  propertyId: string;
  canEdit: boolean;
  busy: boolean;
  /** Enregistre les seuls champs modifiés ; résout à vrai si l'enregistrement a abouti. */
  onSave: (changes: ElementChanges) => Promise<boolean>;
  onCancel: () => void;
  onDelete: () => void;
  /** Panneau latéral (bureau) au lieu d'une feuille haute. */
  variant?: 'sheet' | 'panel';
}

export function EditElementSheet(props: EditElementSheetProps) {
  const { element } = props;
  if (!element) return null;
  // Le formulaire repart de l'appareil à chaque ouverture (et de sa version si elle change).
  return <Form key={`${element.id}-${element.version}`} {...props} element={element} />;
}

function Segments<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className={styles.legend}>{label}</p>
      <div className={styles.segments} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={value === option.value}
            className={`${styles.segment} ${value === option.value ? styles.on : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Form({
  board,
  element,
  propertyId,
  canEdit,
  busy,
  onSave,
  onCancel,
  onDelete,
  variant = 'sheet',
}: EditElementSheetProps & { element: Element }) {
  const kind = element.kind;
  const look = appearanceOf(element);

  const [label, setLabel] = useState(element.label);
  const [ratingA, setRatingA] = useState(element.ratingA);
  const [curve, setCurve] = useState(element.curve);
  const [poles, setPoles] = useState(element.poles);
  const [sensitivityMa, setSensitivityMa] = useState(element.sensitivityMa);
  const [rcdType, setRcdType] = useState(element.rcdType);
  const [protectedByRcdId, setProtectedByRcdId] = useState(element.protectedByRcdId);
  const [rowId, setRowId] = useState(element.rowId);
  const [position, setPosition] = useState(element.position);
  const [width, setWidth] = useState(element.width);
  const [outgoingCables, setOutgoingCables] = useState(element.outgoingCables);
  const [cableSection, setCableSection] = useState(element.cableSection);
  const [brand, setBrand] = useState(element.brand ?? '');
  const [model, setModel] = useState(element.model ?? '');
  const [notes, setNotes] = useState(element.notes ?? '');
  const [photoId, setPhotoId] = useState(element.photoId);
  const [saving, setSaving] = useState(false);

  const rowOf = (id: string) => board.rows.find((r) => r.id === id);
  const row = rowOf(rowId) ?? board.rows[0]!;
  const state = { capacity: row.capacity, elements: row.elements };

  // Place : la largeur est bornée par l'espace libre voisin ; sinon message explicite.
  const maxWidth = maxWidthAt(state, position, element.id);
  const fits = !validateSpan(state, { position, width }, element.id);
  const blocker = fits
    ? null
    : maxWidth === 0
      ? `Le module ${position + 1} est occupé.`
      : `Le module ${position + maxWidth + 1} est occupé : largeur maximale ${maxWidth}.`;
  const widthNote =
    fits && width >= maxWidth && position + width < row.capacity
      ? `Le module ${position + width + 1} est occupé : largeur maximale ${maxWidth}.`
      : null;

  const rcds = useMemo(
    () => board.rows.flatMap((r) => r.elements).filter((e) => e.kind === 'rcd'),
    [board],
  );
  const circuit = useBreakerCircuit(kind === 'breaker' ? element.id : undefined);

  const trimmedLabel = label.trim();
  const changes: ElementChanges = {};
  const diff = <K extends keyof ElementChanges>(key: K, next: ElementChanges[K], prev: unknown) => {
    if (next !== prev) changes[key] = next;
  };
  diff('label', trimmedLabel, element.label);
  if (RATED.includes(kind)) diff('ratingA', ratingA, element.ratingA);
  if (kind === 'breaker') diff('curve', curve, element.curve);
  if (WITH_POLES.includes(kind)) diff('poles', poles, element.poles);
  if (kind === 'rcd') {
    diff('sensitivityMa', sensitivityMa, element.sensitivityMa);
    diff('rcdType', rcdType, element.rcdType);
  }
  if (kind === 'breaker') diff('protectedByRcdId', protectedByRcdId, element.protectedByRcdId);
  diff('rowId', rowId, element.rowId);
  diff('position', position, element.position);
  diff('width', width, element.width);
  if (WITH_CABLES.includes(kind)) {
    diff('outgoingCables', outgoingCables, element.outgoingCables);
    diff('cableSection', cableSection, element.cableSection);
  }
  if (kind !== 'spare') {
    diff('brand', brand.trim() || null, element.brand);
    diff('model', model.trim() || null, element.model);
  }
  diff('notes', notes.trim() || null, element.notes);
  diff('photoId', photoId, element.photoId);

  const dirty = Object.keys(changes).length > 0;
  const needsLabel = kind !== 'spare';
  const canSave = canEdit && dirty && fits && (!needsLabel || trimmedLabel.length > 0) && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(changes);
    } finally {
      setSaving(false);
    }
  }

  const ratings = RATINGS[kind] ?? [];
  const ratingOptions = [
    ...new Set([...ratings, ...(element.ratingA ? [element.ratingA] : [])]),
  ].sort((a, b) => a - b);
  const sectionOptions = [
    ...new Set([...SECTIONS, ...(element.cableSection ? [element.cableSection] : [])]),
  ].sort((a, b) => a - b);

  const stats = circuit.data?.fixtures ?? [];
  const count = (status: string) => stats.filter((f) => f.status === status).length;

  const body = (
    <div className={styles.form}>
      <fieldset className={styles.fieldset} disabled={!canEdit}>
        {needsLabel && (
          <TextField
            label="Libellé"
            value={label}
            maxLength={LIMITS.maxNameLength}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}

        {RATED.includes(kind) && (
          <Segments
            label="Calibre"
            value={ratingA}
            onChange={setRatingA}
            options={ratingOptions.map((v) => ({ value: v, label: String(v) }))}
          />
        )}

        {(kind === 'breaker' || WITH_POLES.includes(kind)) && (
          <div className={styles.pair}>
            {kind === 'breaker' && (
              <Segments
                label="Courbe"
                value={curve}
                onChange={(value) => setCurve(value)}
                options={CURVES.map((v) => ({ value: v, label: v }))}
              />
            )}
            {WITH_POLES.includes(kind) && (
              <Segments label="Pôles" value={poles} onChange={setPoles} options={POLES} />
            )}
          </div>
        )}

        {kind === 'rcd' && (
          <div className={styles.pair}>
            <Segments
              label="Sensibilité"
              value={sensitivityMa}
              onChange={setSensitivityMa}
              options={SENSITIVITIES.map((v) => ({ value: v, label: `${v} mA` }))}
            />
            <Segments
              label="Type"
              value={rcdType}
              onChange={(value) => setRcdType(value)}
              options={RCD_TYPES.map((v) => ({ value: v, label: v }))}
            />
          </div>
        )}

        {kind === 'breaker' && (
          <div>
            <label htmlFor="edit-rcd" className={styles.legend}>
              Différentiel en amont
            </label>
            <select
              id="edit-rcd"
              className={styles.select}
              value={protectedByRcdId ?? ''}
              onChange={(event) => setProtectedByRcdId(event.target.value || null)}
            >
              <option value="">Aucun (ou inconnu)</option>
              {rcds.map((rcd) => (
                <option key={rcd.id} value={rcd.id}>
                  {[
                    rcd.label,
                    rcd.ratingA ? `${rcd.ratingA} A` : null,
                    rcd.sensitivityMa ? `${rcd.sensitivityMa} mA` : null,
                    rcd.rcdType ? `type ${rcd.rcdType}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </option>
              ))}
            </select>
          </div>
        )}

        <section className={styles.position} aria-label="Position sur le rail">
          <p className={styles.legend}>Position sur le rail</p>
          <div className={styles.moveRow}>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Déplacer à gauche"
              disabled={position <= 0}
              onClick={() => setPosition(position - 1)}
            >
              <Icon name="arrow-left" size={20} strokeWidth={2.4} />
            </button>
            <output className={styles.where}>{moduleRange(position, width)}</output>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Déplacer à droite"
              disabled={position + width >= row.capacity}
              onClick={() => setPosition(position + 1)}
            >
              <Icon name="arrow-right" size={20} strokeWidth={2.4} />
            </button>
          </div>
          <div className={styles.moveRow}>
            <label className={styles.rowSelect}>
              <span className="sr-only">Rangée</span>
              <select
                value={rowId}
                onChange={(event) => {
                  setRowId(event.target.value);
                  setPosition((p) => {
                    const target = rowOf(event.target.value);
                    return target ? Math.min(p, Math.max(target.capacity - width, 0)) : p;
                  });
                }}
              >
                {board.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    Rangée {r.index + 1}
                  </option>
                ))}
              </select>
            </label>
            <Stepper
              label="Largeur"
              value={width}
              min={1}
              max={Math.max(maxWidth, width)}
              unit={plural(width, 'module', 'modules')}
              invalid={!fits}
              describedBy="edit-width-note"
              onChange={setWidth}
            />
          </div>
          <p
            id="edit-width-note"
            role={blocker ? 'alert' : undefined}
            className={`${styles.note} ${blocker ? styles.bad : ''}`}
          >
            {blocker ??
              widthNote ??
              `${width} ${plural(width, 'module', 'modules')} sur ${row.capacity}.`}
          </p>
        </section>

        {WITH_CABLES.includes(kind) && (
          <div className={styles.pair}>
            <div>
              <p className={styles.legend}>Câbles sortants</p>
              <Stepper
                label="Câbles sortants"
                value={outgoingCables ?? 0}
                min={0}
                max={99}
                onChange={setOutgoingCables}
              />
            </div>
            <Segments
              label="Section (mm²)"
              value={cableSection}
              onChange={setCableSection}
              options={sectionOptions.map((v) => ({ value: v, label: fr(v) }))}
            />
          </div>
        )}

        {kind !== 'spare' && (
          <div className={styles.pair}>
            <TextField
              label="Marque"
              value={brand}
              placeholder="Ex. Legrand"
              onChange={(event) => setBrand(event.target.value)}
            />
            <TextField
              label="Modèle"
              value={model}
              placeholder="Référence"
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
        )}

        <TextArea
          label="Notes"
          value={notes}
          rows={2}
          placeholder="Ex. Étiquette d’origine illisible"
          onChange={(event) => setNotes(event.target.value)}
        />

        <PhotoField
          propertyId={propertyId}
          photoId={photoId}
          usage="element"
          title="Photo de l’appareil"
          hint="Étiquette, marquage, câblage…"
          onChange={(id) => setPhotoId(id)}
        />
      </fieldset>

      {kind === 'breaker' && circuit.data && (
        <button type="button" className={styles.circuit} onClick={onCancel}>
          <span>
            <strong>
              {stats.length} {plural(stats.length, 'équipement alimenté', 'équipements alimentés')}
            </strong>
            <span className={styles.circuitSub}>
              {count('verified')} {plural(count('verified'), 'vérifié', 'vérifiés')} ·{' '}
              {count('assumed')} {plural(count('assumed'), 'supposé', 'supposés')} ·{' '}
              {count('unknown')} {plural(count('unknown'), 'inconnu', 'inconnus')}
            </span>
          </span>
          <Icon name="chevron-right" size={20} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );

  const actions = (
    <div className={styles.footer}>
      {canEdit && (
        <button
          type="button"
          className={styles.delete}
          aria-label="Supprimer l’appareil"
          disabled={busy}
          onClick={onDelete}
        >
          <Icon name="trash" size={22} strokeWidth={2.2} />
        </button>
      )}
      <Button variant="secondary" size="lg" onClick={onCancel}>
        Annuler
      </Button>
      <Button size="lg" fullWidth disabled={!canSave || busy} onClick={() => void submit()}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  );

  const description = [
    `Rangée ${board.rows.find((r) => r.id === element.rowId)!.index + 1}`,
    moduleRange(element.position, element.width),
  ].join(' · ');

  if (variant === 'panel') {
    return (
      <section className={styles.panel} aria-label={`Modifier ${element.label}`}>
        <header className={styles.head}>
          <span className={styles.badge}>{look.top}</span>
          <div className={styles.titles}>
            <h2 className={styles.title}>{look.kindLabel}</h2>
            <p className={styles.sub}>{description}</p>
          </div>
          <IconButton label="Fermer" icon="close" onClick={onCancel} />
        </header>
        {body}
        {actions}
      </section>
    );
  }

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title={`Modifier : ${look.kindLabel}`}
      description={description}
      footer={actions}
    >
      {body}
    </BottomSheet>
  );
}
