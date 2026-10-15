import type { Fixture, PlanBoard, PlanBreaker, PlanFloor, Room } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import type { FixtureKind, Verification } from '@tableau-clair/domain';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { PhotoField } from '../board-settings/PhotoField';
import { plural } from '../home/format';
import { photoUrl } from '../api/client';
import { breakerName, placeOf } from '../link/place';
import linkStyles from '../link/link.module.css';
import { BottomSheet, Button, Icon, StatusChip, TextField, TypeChip } from '../ui';
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
  // Quand la valeur enregistrée change (conflit, rechargement), le brouillon la rejoint tout de
  // suite, avant tout effet : un blur ne doit jamais renvoyer l'ancien texte par-dessus.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
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
  /** Enregistre les champs modifiés du formulaire (libellé, type) d'un seul coup. */
  onSave: (changes: { label?: string; kind?: FixtureKind }) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
  onShowCircuit: (breakerId: string) => void;
  /** Ouvre le choix du disjoncteur. */
  onPickBreaker: () => void;
  onStatus: (status: Verification) => void;
  onUnlink: () => void;
}

const STATUSES: { value: Verification; label: string }[] = [
  { value: 'verified', label: 'Vérifiée' },
  { value: 'assumed', label: 'Supposée' },
  { value: 'unknown', label: 'Inconnue' },
];

export function FixtureSheet(props: FixtureSheetProps) {
  if (!props.fixture) return null;
  return <FixtureForm key={props.fixture.id} {...props} fixture={props.fixture} />;
}

function FixtureForm(props: FixtureSheetProps & { fixture: Fixture }) {
  const { fixture, room, floor, breaker, canEdit } = props;
  const linked = fixture.link?.breakerId;
  const [label, setLabel] = useState(fixture.label);
  const [kind, setKind] = useState(fixture.kind);
  // Quand l'équipement change côté serveur (enregistrement, conflit), le brouillon le rejoint.
  // Un simple déplacement (x, y) ne touche pas au brouillon : le focus des flèches reste.
  const [synced, setSynced] = useState({ label: fixture.label, kind: fixture.kind });
  if (synced.label !== fixture.label || synced.kind !== fixture.kind) {
    setSynced({ label: fixture.label, kind: fixture.kind });
    setLabel(fixture.label);
    setKind(fixture.kind);
  }
  const trimmed = label.trim();
  const dirty = trimmed !== fixture.label || kind !== fixture.kind;
  const canSave = canEdit && dirty && trimmed.length > 0;
  const save = () => {
    if (!canSave) return;
    props.onSave({
      ...(trimmed !== fixture.label ? { label: trimmed } : {}),
      ...(kind !== fixture.kind ? { kind } : {}),
    });
  };

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={props.onClose}
      title={fixture.label}
      description={[room?.name, floor?.name].filter(Boolean).join(' · ')}
      footer={
        canEdit ? (
          <Button size="lg" fullWidth disabled={!canSave} onClick={save}>
            Enregistrer
          </Button>
        ) : undefined
      }
    >
      <div className={styles.body}>
        <div className={styles.link}>
          {linked ? (
            <>
              <span>
                Disjoncteur : <strong>{breaker ? breakerName(breaker) : 'inconnu'}</strong>
                {breaker ? ` — ${placeOf(breaker)}` : ''}
              </span>
              {fixture.link && <StatusChip status={fixture.link.status} />}
            </>
          ) : (
            <>
              <span>Disjoncteur à identifier</span>
              <StatusChip status="unknown" label="À identifier" />
            </>
          )}
        </div>

        {breaker?.photoId && (
          <img
            className={linkStyles.photo}
            src={photoUrl(breaker.photoId)}
            alt={`Photo du disjoncteur ${breaker.label}`}
          />
        )}

        <div className={styles.actions}>
          {linked && (
            <Button
              size="md"
              variant="secondary"
              icon="eye"
              onClick={() => props.onShowCircuit(linked)}
            >
              Voir le circuit
            </Button>
          )}
          {canEdit && (
            <Button size="md" variant="secondary" icon="plug" onClick={props.onPickBreaker}>
              {linked ? 'Changer de disjoncteur' : 'Choisir le disjoncteur'}
            </Button>
          )}
          {canEdit && linked && (
            <Button size="md" variant="danger-soft" onClick={props.onUnlink}>
              Délier
            </Button>
          )}
        </div>

        {canEdit && linked && fixture.link && (
          <div className={linkStyles.statuses} role="group" aria-label="Fiabilité de la liaison">
            {STATUSES.map((st) => (
              <TypeChip
                key={st.value}
                label={st.label}
                selected={fixture.link?.status === st.value}
                onClick={() => props.onStatus(st.value)}
              />
            ))}
          </div>
        )}

        {canEdit && (
          <>
            <TextField
              label="Libellé"
              value={label}
              maxLength={LIMITS.maxNameLength}
              autoComplete="off"
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <div className={styles.kinds} role="group" aria-label="Type d'équipement">
              {FIXTURE_KINDS_ORDER.map((option) => (
                <TypeChip
                  key={option}
                  label={FIXTURE_KIND_LABEL[option]}
                  selected={kind === option}
                  onClick={() => setKind(option)}
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
  /** Ouvre la modale de renommage ; position et taille se règlent directement sur le plan. */
  onEdit: () => void;
  onDelete: () => void;
  /** Disjoncteurs du logement : pour dire lesquels couper dans cette pièce. */
  breakers: PlanBreaker[];
  onShowCircuit: (breakerId: string) => void;
}

export function RoomSheet(props: RoomSheetProps) {
  if (!props.room) return null;
  return <RoomForm key={props.room.id} {...props} room={props.room} />;
}

function RoomForm(props: RoomSheetProps & { room: Room }) {
  const { room, floor, canEdit } = props;
  const inside = floor?.fixtures.filter((f) => f.roomId === room.id) ?? [];
  const count = inside.length;
  // Un disjoncteur par ligne, avec ce qu'il alimente ici ; les équipements sans lien sont comptés à part.
  const perBreaker = new Map<string, number>();
  for (const f of inside) {
    const id = f.link?.breakerId;
    if (id) perBreaker.set(id, (perBreaker.get(id) ?? 0) + 1);
  }
  const toCut = props.breakers.filter((b) => perBreaker.has(b.id));
  const unidentified = inside.filter((f) => !f.link?.breakerId).length;

  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={props.onClose}
      title={room.name}
      description={`${count} ${plural(count, 'équipement', 'équipements')}`}
      footer={
        canEdit ? (
          <div className={styles.actions} style={{ flex: 1 }}>
            <Button size="lg" fullWidth onClick={props.onEdit}>
              Modifier
            </Button>
            <Button size="lg" variant="danger-soft" icon="trash" onClick={props.onDelete}>
              Supprimer
            </Button>
          </div>
        ) : undefined
      }
    >
      {count > 0 && (
        <div className={styles.body}>
          <h3 className={linkStyles.heading}>À couper pour cette pièce</h3>
          {toCut.length === 0 ? (
            <p className={linkStyles.empty}>Aucun disjoncteur identifié pour ces équipements.</p>
          ) : (
            <ul className={linkStyles.list}>
              {toCut.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={linkStyles.pick}
                    onClick={() => props.onShowCircuit(b.id)}
                  >
                    <span className={linkStyles.text}>
                      <span className={linkStyles.title}>{breakerName(b)}</span>
                      <span className={linkStyles.sub}>{placeOf(b)}</span>
                    </span>
                    <span className={linkStyles.sub}>
                      {perBreaker.get(b.id)}{' '}
                      {plural(perBreaker.get(b.id) ?? 0, 'équipement ici', 'équipements ici')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unidentified > 0 && (
            <p className={linkStyles.sub}>
              {unidentified} {plural(unidentified, 'équipement', 'équipements')} à identifier.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// --- Tableau sélectionné sur le plan --------------------------------------------------------------------------

interface BoardSheetProps {
  board: PlanBoard | null;
  canEdit: boolean;
  onClose: () => void;
  onOpen: (boardId: string) => void;
}

/** Un tableau est un équipement du plan : on le place où l'on veut, on l'ouvre depuis sa fiche. */
export function BoardSheet({ board, canEdit, onClose, onOpen }: BoardSheetProps) {
  if (!board) return null;
  return (
    <BottomSheet
      open
      modal={false}
      floating
      onClose={onClose}
      title={board.name}
      description={board.location ?? 'Tableau électrique'}
      footer={
        <Button size="lg" fullWidth icon="boards" onClick={() => onOpen(board.id)}>
          Ouvrir le tableau
        </Button>
      }
    >
      <p className={styles.legend}>
        {canEdit
          ? 'Faites glisser le tableau sur le plan pour le placer là où il se trouve.'
          : 'Emplacement du tableau sur le plan.'}
      </p>
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
        <div className={styles.split}>
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
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
              Verrouiller l’image (retire « Déplacer l’image »)
            </label>
            <p className={styles.hint}>
              Déverrouillée, utilisez « Déplacer l’image » au-dessus du plan, puis faites-la
              glisser.
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
