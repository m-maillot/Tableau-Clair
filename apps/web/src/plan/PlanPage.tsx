import type { Fixture, PlanFloor, Room } from '@tableau-clair/contracts';
import {
  clampPoint,
  moveRect,
  roomAt,
  type FixtureKind,
  type Point,
  type Rect,
} from '@tableau-clair/domain';
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router';
import { plural } from '../home/format';
import { usePlan, useProperties, useSelectedProperty } from '../home/queries';
import { Button, Icon, IconButton, Toast } from '../ui';
import { FIXTURE_KIND_ICON, defaultFixtureLabel } from './fixture-kinds';
import { FloorTabs } from './FloorTabs';
import styles from './PlanPage.module.css';
import { PlanCanvas, type Mode, type Selection } from './PlanCanvas';
import {
  ConfirmSheet,
  FixtureSheet,
  FloorSheet,
  NameSheet,
  PaletteSheet,
  RoomSheet,
} from './sheets';
import { usePlanActions } from './usePlanActions';

type Dialog = 'palette' | 'floor' | 'newFloor' | 'newRoom' | 'deleteRoom' | 'deleteFixture' | null;

interface Ghost {
  kind: FixtureKind;
  x: number;
  y: number;
}

const center = (r: Rect): Point => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) });

/** `/plan` : les pièces du logement, les équipements et le circuit mis en évidence. */
export function PlanPage() {
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);
  const propertyId = property?.id;
  const plan = usePlan(propertyId);
  const actions = usePlanActions(propertyId ?? '');
  const [params, setParams] = useSearchParams();

  const [floorId, setFloorId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [selected, setSelected] = useState<Selection>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [drawn, setDrawn] = useState<Rect | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const canEdit = property?.role !== 'viewer';
  const floors = useMemo(() => plan.data?.floors ?? [], [plan.data]);
  const floor: PlanFloor | undefined = floors.find((f) => f.id === floorId) ?? floors[0];
  const breakers = plan.data?.breakers ?? [];
  const breakerId = params.get('breaker');
  const breaker = breakers.find((b) => b.id === breakerId);

  const selectedRoom =
    selected?.type === 'room' ? floor?.rooms.find((r) => r.id === selected.id) : undefined;
  const selectedFixture =
    selected?.type === 'fixture' ? floor?.fixtures.find((f) => f.id === selected.id) : undefined;
  const fixtureRoom = selectedFixture && floor?.rooms.find((r) => r.id === selectedFixture.roomId);
  const fixtureBreaker = breakers.find((b) => b.id === selectedFixture?.link?.breakerId);

  const allFixtures = useMemo(() => floors.flatMap((f) => f.fixtures), [floors]);

  // Arrivée depuis une recherche ou une fiche : ?fixture=… / ?room=… sélectionne et ouvre le bon étage.
  const wantedFixture = params.get('fixture');
  const wantedRoom = params.get('room');
  useEffect(() => {
    if (!plan.data || (!wantedFixture && !wantedRoom)) return;
    for (const f of plan.data.floors) {
      const fixture = wantedFixture ? f.fixtures.find((x) => x.id === wantedFixture) : undefined;
      const room = wantedRoom ? f.rooms.find((x) => x.id === wantedRoom) : undefined;
      if (fixture || room) {
        setFloorId(f.id);
        setSelected(fixture ? { type: 'fixture', id: fixture.id } : { type: 'room', id: room!.id });
        break;
      }
    }
    const next = new URLSearchParams(params);
    next.delete('fixture');
    next.delete('room');
    setParams(next, { replace: true });
  }, [plan.data, wantedFixture, wantedRoom, params, setParams]);

  function showCircuit(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('breaker', id);
    else next.delete('breaker');
    setParams(next, { replace: true });
  }

  // --- Ajout d'équipements -----------------------------------------------------------------------------
  async function placeFixture(kind: FixtureKind, room: Room, at: Point) {
    const created = await actions.addFixture(room.id, {
      kind,
      label: defaultFixtureLabel(kind, allFixtures),
      x: at.x,
      y: at.y,
    });
    if (created) setSelected({ type: 'fixture', id: created.id });
  }

  function addAtCenter(kind: FixtureKind) {
    const room = selectedRoom ?? fixtureRoom ?? floor?.rooms[0];
    if (!room) {
      actions.refuse('Dessinez d’abord une pièce pour y placer des équipements.');
      return;
    }
    void placeFixture(kind, room, center(room));
  }

  /** Glissé depuis la palette : un simple appui ajoute au centre, un glissé dépose où l'on lâche. */
  function startPaletteDrag(kind: FixtureKind, event: ReactPointerEvent) {
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;

    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 6) {
        moved = true;
        setDialog(null); // la palette se retire pour laisser voir le plan
      }
      if (moved) setGhost({ kind, x: e.clientX, y: e.clientY });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cleanup);
      setGhost(null);
    };
    const onUp = (e: PointerEvent) => {
      cleanup();
      if (!moved) {
        setDialog(null);
        addAtCenter(kind);
        return;
      }
      const svg = document.querySelector('[data-plan-canvas]');
      if (!svg || !floor) return;
      const rect = svg.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) return;
      const k = rect.width > 0 ? rect.width / floor.width : 1;
      const point = {
        x: Math.round((e.clientX - rect.left) / k),
        y: Math.round((e.clientY - rect.top) / k),
      };
      const room = roomAt(floor.rooms, point);
      if (!room) actions.refuse('Déposez l’équipement à l’intérieur d’une pièce.');
      else void placeFixture(kind, room, point);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cleanup);
  }

  // --- Rendu -------------------------------------------------------------------------------------------
  if (properties.isPending || (propertyId && plan.isPending)) {
    return (
      <main className={styles.page}>
        <p role="status" className={styles.status}>
          Chargement…
        </p>
      </main>
    );
  }
  if (!property) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Plan</h1>
        <p className={styles.status}>Créez d’abord un logement depuis l’accueil.</p>
      </main>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Plan</h1>
        <p role="alert" className={styles.status}>
          Impossible de charger le plan.
        </p>
        <Button onClick={() => void plan.refetch()}>Réessayer</Button>
      </main>
    );
  }

  const roomCount = floor?.rooms.length ?? 0;
  const unlinked = floor?.fixtures.filter((f) => !f.link?.breakerId).length ?? 0;
  const position = floor ? floors.findIndex((f) => f.id === floor.id) : 0;

  const moveFloor = (delta: -1 | 1) => {
    const ids = floors.map((f) => f.id);
    const from = ids.indexOf(floor!.id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void actions.reorder(ids);
  };

  return (
    <main className={styles.page}>
      {actions.notice && <Toast tone={actions.notice.tone}>{actions.notice.text}</Toast>}

      <header className={styles.header}>
        <h1 className={styles.title}>Plan</h1>
        {canEdit && floor && (
          <button type="button" className={styles.addButton} onClick={() => setDialog('palette')}>
            <Icon name="plus" size={16} strokeWidth={2.6} />
            Équipement
          </button>
        )}
      </header>

      {floors.length === 0 ? (
        <section className={styles.empty} aria-labelledby="empty-title">
          <h2 id="empty-title" className={styles.emptyTitle}>
            Dessinez le plan de votre logement
          </h2>
          <p>
            Créez un étage, tracez ses pièces, puis placez prises, luminaires et appareils pour
            retrouver quel disjoncteur les alimente.
          </p>
          {canEdit ? (
            <Button size="lg" onClick={() => setDialog('newFloor')}>
              Créer le premier étage
            </Button>
          ) : (
            <p className={styles.status}>Aucun étage n’a encore été créé.</p>
          )}
        </section>
      ) : (
        <>
          <FloorTabs
            floors={floors}
            currentId={floor?.id ?? null}
            canEdit={canEdit}
            onSelect={(id) => {
              setFloorId(id);
              setSelected(null);
            }}
            onAdd={() => setDialog('newFloor')}
            onSettings={() => setDialog('floor')}
          />

          {breaker && (
            <div className={styles.banner} role="status">
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.bannerText}>
                {breaker.label}
                {breaker.ratingA ? ` · ${breaker.ratingA} A` : ''}
              </span>
              <span className={styles.bannerCount}>
                {breaker.linkedCount} {plural(breaker.linkedCount, 'équipement', 'équipements')}
              </span>
              <IconButton
                label="Retirer la mise en évidence du circuit"
                icon="close"
                variant="white"
                onClick={() => showCircuit(null)}
              />
            </div>
          )}

          {canEdit && floor && (
            <div className={styles.modes} role="group" aria-label="Outil">
              <button
                type="button"
                aria-pressed={mode === 'select'}
                className={`${styles.mode} ${mode === 'select' ? styles.modeOn : ''}`}
                onClick={() => setMode('select')}
              >
                Sélectionner
              </button>
              <button
                type="button"
                aria-pressed={mode === 'draw'}
                className={`${styles.mode} ${mode === 'draw' ? styles.modeOn : ''}`}
                onClick={() => {
                  setMode('draw');
                  setSelected(null);
                }}
              >
                Dessiner une pièce
              </button>
            </div>
          )}

          {floor && (
            <div className={styles.canvasWrap}>
              <PlanCanvas
                floor={floor}
                mode={mode}
                canEdit={canEdit}
                selected={selected}
                highlightBreakerId={breaker?.id ?? null}
                onSelect={setSelected}
                onFixtureDropped={(fixture: Fixture, to) =>
                  void actions.updateFixture(fixture.id, {
                    x: to.x,
                    y: to.y,
                    ...(to.roomId !== fixture.roomId ? { roomId: to.roomId } : {}),
                  })
                }
                onFixtureRefused={() =>
                  actions.refuse('Déposez l’équipement à l’intérieur d’une pièce.')
                }
                onRoomChanged={(room, rect) => void actions.updateRoom(room.id, rect)}
                onRoomDrawn={(rect) => {
                  setDrawn(rect);
                  setDialog('newRoom');
                }}
                onRoomTooSmall={() =>
                  actions.refuse('Pièce trop petite : tracez un rectangle plus grand.')
                }
                onBackgroundMoved={(p) =>
                  void actions.updateFloor(floor.id, { backgroundX: p.x, backgroundY: p.y })
                }
              />
              {roomCount === 0 && (
                <p className={styles.hint}>
                  {canEdit
                    ? 'Aucune pièce : choisissez « Dessiner une pièce », puis tracez un rectangle sur le plan.'
                    : 'Aucune pièce sur cet étage.'}
                </p>
              )}
            </div>
          )}

          <ul className={styles.legend} aria-label="Légende">
            <li>
              <span className={`${styles.swatch} ${styles.swatchOn}`} aria-hidden="true" />
              Ce circuit
            </li>
            <li>
              <span className={`${styles.swatch} ${styles.swatchOther}`} aria-hidden="true" />
              Autre circuit
            </li>
            <li>
              <span className={`${styles.swatch} ${styles.swatchUnknown}`} aria-hidden="true" />À
              identifier{unlinked > 0 ? ` (${unlinked})` : ''}
            </li>
          </ul>
        </>
      )}

      {/* --- Feuilles ---------------------------------------------------------------------------------- */}
      <FixtureSheet
        fixture={selectedFixture ?? null}
        room={fixtureRoom}
        floor={floor}
        breaker={fixtureBreaker}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onRename={(label) =>
          selectedFixture && void actions.updateFixture(selectedFixture.id, { label })
        }
        onKind={(kind) =>
          selectedFixture && void actions.updateFixture(selectedFixture.id, { kind })
        }
        onNudge={(dx, dy) => {
          if (!selectedFixture || !fixtureRoom) return;
          const p = clampPoint(fixtureRoom, {
            x: selectedFixture.x + dx,
            y: selectedFixture.y + dy,
          });
          void actions.updateFixture(selectedFixture.id, { x: p.x, y: p.y });
        }}
        onDelete={() => setDialog('deleteFixture')}
        onShowCircuit={(id) => showCircuit(id)}
      />

      <RoomSheet
        room={selectedFixture ? null : (selectedRoom ?? null)}
        floor={floor}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onRename={(name) => selectedRoom && void actions.updateRoom(selectedRoom.id, { name })}
        onResize={(change) => selectedRoom && void actions.updateRoom(selectedRoom.id, change)}
        onNudge={(dx, dy) => {
          if (!selectedRoom || !floor) return;
          const next = moveRect(selectedRoom, dx, dy, { w: floor.width, h: floor.height });
          void actions.updateRoom(selectedRoom.id, { x: next.x, y: next.y });
        }}
        onDelete={() => setDialog('deleteRoom')}
      />

      <PaletteSheet
        open={dialog === 'palette'}
        onClose={() => setDialog(null)}
        onPick={(kind) => {
          setDialog(null);
          addAtCenter(kind);
        }}
        onDragStart={startPaletteDrag}
      />

      <NameSheet
        open={dialog === 'newFloor'}
        title="Nouvel étage"
        label="Nom de l’étage"
        initial={floors.length === 0 ? 'Rez-de-chaussée' : `Étage ${floors.length}`}
        submit="Créer l’étage"
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          setDialog(null);
          const created = await actions.addFloor(name);
          if (created) setFloorId(created.id);
        }}
      />

      <NameSheet
        open={dialog === 'newRoom'}
        title="Nouvelle pièce"
        description="Donnez-lui un nom : cuisine, salon, garage…"
        label="Nom de la pièce"
        initial={`Pièce ${roomCount + 1}`}
        submit="Créer la pièce"
        onClose={() => {
          setDialog(null);
          setDrawn(null);
        }}
        onSubmit={async (name) => {
          const rect = drawn;
          setDialog(null);
          setDrawn(null);
          setMode('select');
          if (!rect || !floor) return;
          const created = await actions.addRoom(floor.id, { name, ...rect });
          if (created) setSelected({ type: 'room', id: created.id });
        }}
      />

      <FloorSheet
        open={dialog === 'floor'}
        floor={floor}
        propertyId={propertyId!}
        position={position}
        count={floors.length}
        onClose={() => setDialog(null)}
        onRename={(name) => floor && void actions.updateFloor(floor.id, { name })}
        onMove={moveFloor}
        onBackground={(change) => floor && void actions.updateFloor(floor.id, change)}
        onDelete={async () => {
          if (!floor) return;
          setDialog(null);
          setFloorId(null);
          setSelected(null);
          await actions.removeFloor(floor.id);
        }}
      />

      <ConfirmSheet
        open={dialog === 'deleteRoom' && !!selectedRoom}
        title={`Supprimer « ${selectedRoom?.name ?? ''} » ?`}
        text={`${
          floor?.fixtures.filter((f) => f.roomId === selectedRoom?.id).length ?? 0
        } équipement(s) de cette pièce seront supprimés avec elle, ainsi que leurs liaisons.`}
        confirm="Supprimer la pièce"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          const room = selectedRoom;
          setDialog(null);
          setSelected(null);
          if (room) void actions.removeRoom(room.id);
        }}
      />

      <ConfirmSheet
        open={dialog === 'deleteFixture' && !!selectedFixture}
        title={`Supprimer « ${selectedFixture?.label ?? ''} » ?`}
        text={
          selectedFixture?.link?.breakerId
            ? 'Cet équipement est relié à un disjoncteur : la liaison disparaît avec lui.'
            : 'Cet équipement sera retiré du plan.'
        }
        confirm="Supprimer l’équipement"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          const fixture = selectedFixture;
          setDialog(null);
          setSelected(null);
          if (fixture) void actions.removeFixture(fixture.id);
        }}
      />

      {ghost && (
        <span className={styles.ghost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <Icon name={FIXTURE_KIND_ICON[ghost.kind]} size={18} strokeWidth={2.4} />
        </span>
      )}
    </main>
  );
}
