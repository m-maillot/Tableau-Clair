import type { Fixture, PlanBreaker, PlanFloor, Room } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import { MIN_ROOM_SIZE, type FixtureKind } from '@tableau-clair/domain';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { PhotoField } from '../board-settings/PhotoField';
import { plural } from '../home/format';
import { BottomSheet, Button, Icon, Stepper, StatusChip, TextField, TypeChip } from '../ui';
import { FIXTURE_KIND_ICON, FIXTURE_KIND_LABEL, FIXTURE_KINDS_ORDER } from './fixture-kinds';
import styles from './sheets.module.css';

const NUDGE = 10;

/** Flèches de déplacement fin : alternative au glisser pour le clavier et les lecteurs d'écran. */
function Nudge({
  onMove,
  disabled,
}: {
  onMove: (dx: number, dy: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.nudge} role="group" aria-label="Déplacer">
      <button
        type="button"
        disabled={disabled}
        aria-label="Déplacer vers le haut"
        onClick={() => onMove(0, -NUDGE)}
      >
        <Icon
          name="arrow-left"
          size={18}
          strokeWidth={2.4}
          style={{ transform: 'rotate(90deg)' }}
        />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Déplacer vers le bas"
        onClick={() => onMove(0, NUDGE)}
      >
        <Icon
          name="arrow-left"
          size={18}
          strokeWidth={2.4}
          style={{ transform: 'rotate(-90deg)' }}
        />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Déplacer à gauche"
        onClick={() => onMove(-NUDGE, 0)}
      >
        <Icon name="arrow-left" size={18} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Déplacer à droite"
        onClick={() => onMove(NUDGE, 0)}
      >
        <Icon name="arrow-right" size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** Texte validé à la sortie du champ ou à Entrée (pas à chaque frappe : une requête par saisie). */
function CommitField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <TextField
      label={label}
      value={draft}
      maxLength={LIMITS.maxNameLength}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

/** Curseur dont la valeur s'affiche tout de suite et n'est envoyée qu'après une courte pause. */
function DebouncedRange({
  label,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onCommit(draft), 300);
    return () => clearTimeout(timer);
    // `onCommit` change à chaque rendu : seule la valeur saisie relance la pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <label className={styles.range}>
      <span>
        {label} : {draft} {unit}
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
      />
    </label>
  );
}

/** Confirmation d'une suppression : modale, avec ce qui disparaît. */
export function ConfirmSheet({
  open,
  title,
  text,
  confirm,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className={styles.actions} style={{ flex: 1 }}>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" size="lg" fullWidth onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      }
    >
      <p>{text}</p>
    </BottomSheet>
  );
}

// --- Équipement sélectionné --------------------------------------------------------------------------------

interface FixtureSheetProps {
  fixture: Fixture | null;
  room: Room | undefined;
  floor: PlanFloor | undefined;
  breaker: PlanBreaker | undefined;
  canEdit: boolean;
  onClose: () => void;
  onRename: (label: string) => void;
  onKind: (kind: FixtureKind) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
  onShowCircuit: (breakerId: string) => void;
}

export function FixtureSheet(props: FixtureSheetProps) {
  const { fixture, room, floor, breaker, canEdit } = props;
  if (!fixture) return null;
  const linked = fixture.link?.breakerId;

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={props.onClose}
      title={fixture.label}
      description={[room?.name, floor?.name].filter(Boolean).join(' · ')}
    >
      <div className={styles.body}>
        <div className={styles.link}>
          {linked ? (
            <>
              <span>
                Disjoncteur : <strong>{breaker?.label ?? 'inconnu'}</strong>
                {breaker?.ratingA ? ` · ${breaker.ratingA} A` : ''}
              </span>
              {fixture.link && <StatusChip status={fixture.link.status} />}
              <Button
                size="md"
                variant="secondary"
                icon="eye"
                onClick={() => props.onShowCircuit(linked)}
              >
                Voir le circuit
              </Button>
            </>
          ) : (
            <>
              <span>Disjoncteur à identifier</span>
              <StatusChip status="unknown" label="À identifier" />
            </>
          )}
        </div>

        {canEdit && (
          <>
            <CommitField label="Libellé" value={fixture.label} onCommit={props.onRename} />
            <div className={styles.kinds} role="group" aria-label="Type d'équipement">
              {FIXTURE_KINDS_ORDER.map((kind) => (
                <TypeChip
                  key={kind}
                  label={FIXTURE_KIND_LABEL[kind]}
                  selected={fixture.kind === kind}
                  onClick={() => props.onKind(kind)}
                />
              ))}
            </div>
            <div className={styles.actions}>
              <Nudge onMove={props.onNudge} />
              <Button variant="danger-soft" icon="trash" onClick={props.onDelete}>
                Supprimer
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// --- Pièce sélectionnée ------------------------------------------------------------------------------------

interface RoomSheetProps {
  room: Room | null;
  floor: PlanFloor | undefined;
  canEdit: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onResize: (change: { w?: number; h?: number }) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
}

export function RoomSheet(props: RoomSheetProps) {
  const { room, floor, canEdit } = props;
  if (!room) return null;
  const count = floor?.fixtures.filter((f) => f.roomId === room.id).length ?? 0;

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={props.onClose}
      title={room.name}
      description={`${count} ${plural(count, 'équipement', 'équipements')}`}
    >
      {canEdit ? (
        <div className={styles.body}>
          <CommitField label="Nom de la pièce" value={room.name} onCommit={props.onRename} />
          <div className={styles.sizes}>
            <div>
              <p className={styles.legend}>Largeur</p>
              <Stepper
                label="Largeur de la pièce"
                value={room.w}
                step={NUDGE}
                min={MIN_ROOM_SIZE}
                max={floor ? floor.width - room.x : undefined}
                onChange={(w) => props.onResize({ w })}
              />
            </div>
            <div>
              <p className={styles.legend}>Hauteur</p>
              <Stepper
                label="Hauteur de la pièce"
                value={room.h}
                step={NUDGE}
                min={MIN_ROOM_SIZE}
                max={floor ? floor.height - room.y : undefined}
                onChange={(h) => props.onResize({ h })}
              />
            </div>
          </div>
          <div className={styles.actions}>
            <Nudge onMove={props.onNudge} />
            <Button variant="danger-soft" icon="trash" onClick={props.onDelete}>
              Supprimer
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

// --- Palette d'équipements ----------------------------------------------------------------------------------

interface PaletteSheetProps {
  open: boolean;
  onClose: () => void;
  /** Appui simple : ajout au centre de la pièce active. */
  onPick: (kind: FixtureKind) => void;
  /** Début d'un glissé vers le plan. */
  onDragStart: (kind: FixtureKind, event: PointerEvent) => void;
}

export function PaletteSheet({ open, onClose, onPick, onDragStart }: PaletteSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Ajouter un équipement"
      description="Touchez un type pour l'ajouter à la pièce active, ou faites-le glisser sur le plan."
    >
      <ul className={styles.palette}>
        {FIXTURE_KINDS_ORDER.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              className={styles.paletteItem}
              onPointerDown={(event) => onDragStart(kind, event)}
              onKeyDown={(event) => {
                // Au clavier : Entrée / Espace ajoutent directement.
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPick(kind);
                }
              }}
            >
              <span className={styles.paletteIcon}>
                <Icon name={FIXTURE_KIND_ICON[kind]} size={22} />
              </span>
              {FIXTURE_KIND_LABEL[kind]}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

// --- Nom d'une pièce ou d'un étage à créer --------------------------------------------------------------------

interface NameSheetProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  initial: string;
  submit: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function NameSheet({
  open,
  title,
  description,
  label,
  initial,
  submit,
  onSubmit,
  onClose,
}: NameSheetProps) {
  const [name, setName] = useState(initial);
  const reset = useRef(initial);
  useEffect(() => {
    if (open) {
      reset.current = initial;
      setName(initial);
    }
  }, [open, initial]);

  const onForm = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
    >
      <form onSubmit={onForm} className={styles.body}>
        <TextField
          label={label}
          value={name}
          maxLength={LIMITS.maxNameLength}
          autoComplete="off"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        <div className={styles.actions}>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" size="lg" fullWidth disabled={!name.trim()}>
            {submit}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

// --- Réglages d'un étage -----------------------------------------------------------------------------------------

interface FloorSheetProps {
  open: boolean;
  floor: PlanFloor | undefined;
  propertyId: string;
  position: number;
  count: number;
  onClose: () => void;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onBackground: (change: {
    backgroundImageId?: string | null;
    backgroundOpacity?: number;
    backgroundScale?: number;
    backgroundX?: number;
    backgroundY?: number;
    backgroundLocked?: boolean;
  }) => void;
  onDelete: () => void;
}

export function FloorSheet(props: FloorSheetProps) {
  const { open, floor } = props;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  if (!floor) return null;

  const rooms = floor.rooms.length;
  const fixtures = floor.fixtures.length;
  const hasBackground = !!floor.backgroundImageId;

  return (
    <BottomSheet
      open={open}
      onClose={props.onClose}
      title="Réglages de l’étage"
      description={floor.name}
    >
      <div className={styles.body}>
        <CommitField label="Nom de l’étage" value={floor.name} onCommit={props.onRename} />

        <div className={styles.row}>
          <span className={styles.legend}>Ordre des onglets</span>
          <div className={styles.pair}>
            <Button
              size="md"
              variant="secondary"
              icon="arrow-left"
              disabled={props.position === 0}
              onClick={() => props.onMove(-1)}
            >
              Avant
            </Button>
            <Button
              size="md"
              variant="secondary"
              icon="arrow-right"
              disabled={props.position >= props.count - 1}
              onClick={() => props.onMove(1)}
            >
              Après
            </Button>
          </div>
        </div>

        <PhotoField
          propertyId={props.propertyId}
          photoId={floor.backgroundImageId}
          usage="floor_background"
          title="Image de fond"
          hint="Photo ou scan d'un plan, pour décalquer les pièces. Facultative."
          onChange={(id, uploaded, photo) => {
            if (!id) return props.onBackground({ backgroundImageId: null });
            // Nouvelle image : cadrée dans le plan, légèrement transparente pour dessiner par-dessus.
            const fit = photo
              ? Math.min(floor.width / photo.width, floor.height / photo.height)
              : 1;
            props.onBackground({
              backgroundImageId: id,
              backgroundScale: Number(fit.toFixed(4)),
              backgroundX: 0,
              backgroundY: 0,
              backgroundOpacity: 0.6,
              backgroundLocked: false,
            });
            void uploaded;
          }}
        />

        {hasBackground && (
          <div className={styles.background}>
            <DebouncedRange
              label="Opacité"
              unit="%"
              min={5}
              max={100}
              step={5}
              value={Math.round(floor.backgroundOpacity * 100)}
              onCommit={(v) => props.onBackground({ backgroundOpacity: v / 100 })}
            />
            <DebouncedRange
              label="Taille"
              unit="%"
              min={10}
              max={300}
              step={5}
              value={Math.round(floor.backgroundScale * 100)}
              onCommit={(v) => props.onBackground({ backgroundScale: v / 100 })}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={floor.backgroundLocked}
                onChange={(event) => props.onBackground({ backgroundLocked: event.target.checked })}
              />
              Verrouiller l’image (évite de la déplacer en dessinant)
            </label>
            <p className={styles.hint}>
              Déverrouillée, l’image se déplace en la faisant glisser sur le plan.
            </p>
            <Button
              size="md"
              variant="secondary"
              onClick={() => props.onBackground({ backgroundX: 0, backgroundY: 0 })}
            >
              Recentrer l’image
            </Button>
          </div>
        )}

        {confirming ? (
          <div className={styles.confirm} role="alert">
            <p>
              Supprimer « {floor.name} » retire {rooms} {plural(rooms, 'pièce', 'pièces')} et{' '}
              {fixtures} {plural(fixtures, 'équipement', 'équipements')}. Leurs liaisons avec les
              disjoncteurs disparaissent.
            </p>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button variant="danger" onClick={props.onDelete}>
                Supprimer l’étage
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger-soft" icon="trash" onClick={() => setConfirming(true)}>
            Supprimer l’étage…
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
