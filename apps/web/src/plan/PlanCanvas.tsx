import type { Fixture, PlanBoard, PlanFloor, Room } from '@tableau-clair/contracts';
import {
  moveRect,
  rectFromCorners,
  resizeRect,
  roomAt,
  type Handle,
  type Point,
  type Rect,
  MIN_ROOM_SIZE,
  PLAN_WORLD,
} from '@tableau-clair/domain';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { photoUrl } from '../api/client';
import { Icon } from '../ui';
import { FIXTURE_KIND_ICON, FIXTURE_KIND_LABEL } from './fixture-kinds';
import styles from './PlanCanvas.module.css';

export type Selection = { type: 'room' | 'fixture' | 'board'; id: string } | null;
/** `image` : le glissé sur le fond déplace l'image de fond (déverrouillée) au lieu de la vue. */
export type Mode = 'select' | 'draw' | 'image';

/** État d'un équipement vis-à-vis du circuit mis en évidence (spec §7.4). */
export type FixtureState = 'highlighted' | 'linked' | 'unlinked';

export function fixtureState(fixture: Fixture, highlightBreakerId: string | null): FixtureState {
  const breakerId = fixture.link?.breakerId ?? null;
  if (!breakerId) return 'unlinked';
  return highlightBreakerId && breakerId === highlightBreakerId ? 'highlighted' : 'linked';
}

/** Pas des flèches du clavier (alternative au glisser), en unités du plan. */
const KEY_STEP = 10;
const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
interface PlanCanvasProps {
  floor: PlanFloor;
  mode: Mode;
  canEdit: boolean;
  selected: Selection;
  highlightBreakerId: string | null;
  /** Demande de recentrage sur une pièce (le `nonce` change à chaque demande). */
  focus?: { roomId: string; nonce: number } | null;
  onSelect: (selection: Selection) => void;
  onFixtureDropped: (fixture: Fixture, to: { x: number; y: number; roomId: string }) => void;
  onFixtureRefused: () => void;
  onRoomChanged: (room: Room, rect: Rect) => void;
  onRoomDrawn: (rect: Rect) => void;
  onRoomTooSmall: () => void;
  onBackgroundMoved: (position: Point) => void;
  onBoardMoved: (board: PlanBoard, to: Point) => void;
}

type Gesture =
  | { type: 'board'; board: PlanBoard; start: Point; current: Point; moved: boolean }
  | { type: 'fixture'; fixture: Fixture; start: Point; current: Point; moved: boolean }
  | { type: 'room'; room: Room; start: Point; current: Rect; moved: boolean }
  | { type: 'handle'; room: Room; handle: Handle; start: Point; current: Rect; moved: boolean }
  | { type: 'draw'; start: Point; current: Rect; moved: boolean }
  | { type: 'background'; start: Point; origin: Point; current: Point; moved: boolean }
  /** Déplacement de la vue (plan zoomé) ; `start` est en pixels d'écran. */
  | { type: 'pan'; start: Point; origin: Point; moved: boolean };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;

const DRAG_THRESHOLD_PX = 4;
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const round = (n: number) => Math.round(n);
const roundRect = (r: Rect): Rect => ({
  x: round(r.x),
  y: round(r.y),
  w: round(r.w),
  h: round(r.h),
});

export function PlanCanvas(props: PlanCanvasProps) {
  const { floor, mode, canEdit, selected, highlightBreakerId } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [baseScale, setBaseScale] = useState(0.35); // pixels d'écran par unité de plan, plan entier
  // Vue : facteur de zoom et origine (en unités du plan) du coin haut-gauche visible.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  // Rectangle du plan figé pendant un geste : si la mise en page bouge entre l'appui et le relâchement
  // (ouverture d'un panneau, redimensionnement), le geste garde ses repères et ne déplace rien.
  const frozenRect = useRef<DOMRect | null>(null);
  const selectionAtDown = useRef<Selection>(null);
  const scale = baseScale * view.zoom;
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Plan illimité : seules les bornes très lointaines du monde limitent les gestes.
  const canvas = { x: -PLAN_WORLD, y: -PLAN_WORLD, w: PLAN_WORLD * 2, h: PLAN_WORLD * 2 };

  // Les repères (poignées, marqueurs, texte) gardent une taille constante à l'écran.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setBaseScale(width / floor.width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [floor.width]);

  const px = (n: number) => n / scale;

  const visibleW = floor.width / view.zoom;
  const visibleH = floor.height / view.zoom;

  function toPoint(event: PointerEvent | globalThis.PointerEvent): Point {
    const rect = frozenRect.current ?? svgRef.current!.getBoundingClientRect();
    const k = rect.width > 0 ? rect.width / visibleW : 1;
    return {
      x: view.x + (event.clientX - rect.left) / k,
      y: view.y + (event.clientY - rect.top) / k,
    };
  }

  /** Vue : zoom entre 10 % et 800 %, déplacement libre (seul le bord du monde la retient). */
  function fit(zoom: number, x: number, y: number) {
    const z = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    const limit = (value: number, size: number) =>
      Math.min(Math.max(value, -PLAN_WORLD), PLAN_WORLD - size);
    return {
      zoom: z,
      x: limit(x, floor.width / z),
      y: limit(y, floor.height / z),
    };
  }

  /** Vue qui cadre tout le contenu (pièces, équipements, image de fond), ou le départ si vide. */
  function showAll() {
    const boxes: Rect[] = floor.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    for (const f of floor.fixtures) boxes.push({ x: f.x, y: f.y, w: 0, h: 0 });
    for (const b of floor.boards) boxes.push({ x: b.x, y: b.y, w: 0, h: 0 });
    if (floor.backgroundImageId && bg) {
      boxes.push({
        x: floor.backgroundX,
        y: floor.backgroundY,
        w: bg.width * floor.backgroundScale,
        h: bg.height * floor.backgroundScale,
      });
    }
    if (boxes.length === 0) {
      setView({ zoom: 1, x: 0, y: 0 });
      return;
    }
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const margin = 0.08;
    const w = Math.max(right - left, MIN_ROOM_SIZE) * (1 + margin * 2);
    const h = Math.max(bottom - top, MIN_ROOM_SIZE) * (1 + margin * 2);
    const zoom = Math.min(floor.width / w, floor.height / h);
    const z = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    setView(fit(z, cx - floor.width / z / 2, cy - floor.height / z / 2));
  }

  /** Zoome en gardant fixe le point du plan situé sous (clientX, clientY). */
  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    const current = viewRef.current;
    const fx = rect && clientX !== undefined ? (clientX - rect.left) / rect.width : 0.5;
    const fy = rect && clientY !== undefined ? (clientY - rect.top) / rect.height : 0.5;
    const zoom = Math.min(Math.max(current.zoom * factor, MIN_ZOOM), MAX_ZOOM);
    const px0 = current.x + fx * (floor.width / current.zoom);
    const py0 = current.y + fy * (floor.height / current.zoom);
    setView(fit(zoom, px0 - fx * (floor.width / zoom), py0 - fy * (floor.height / zoom)));
  }

  // Recentre la vue sur la pièce choisie dans la liste, en gardant le zoom (et en dézoomant si elle
  // dépasse de la vue).
  const focusNonce = props.focus?.nonce;
  useEffect(() => {
    const target = props.focus && floor.rooms.find((r) => r.id === props.focus!.roomId);
    if (!target) return;
    const current = viewRef.current;
    const needed = Math.min(floor.width / (target.w * 1.4), floor.height / (target.h * 1.4));
    const zoom = Math.min(current.zoom, Math.max(needed, MIN_ZOOM));
    setView(
      fit(
        zoom,
        target.x + target.w / 2 - floor.width / zoom / 2,
        target.y + target.h / 2 - floor.height / zoom / 2,
      ),
    );
    // Seul un nouveau `nonce` déclenche un recentrage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  // Molette : Ctrl/⌘ + molette (ou pincement du pavé tactile) zoome ; zoomé, la molette déplace la vue.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
      } else if (viewRef.current.zoom > 1) {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const k = rect.width / (floor.width / viewRef.current.zoom);
        const { zoom, x, y } = viewRef.current;
        setView(fit(zoom, x + event.deltaX / k, y + event.deltaY / k));
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // zoomAt et fit ne dépendent que du plan courant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.width, floor.height]);

  /** Deux doigts : pincement (zoom) et déplacement de la vue ; tout geste en cours est abandonné. */
  function trackPointers(event: PointerEvent) {
    // Sélection avant le premier doigt : un pincement posé sur une pièce ne doit pas la sélectionner.
    if (pointers.current.size === 0) selectionAtDown.current = propsRef.current.selected;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      propsRef.current.onSelect(selectionAtDown.current);
      gestureRef.current = null;
      setGesture(null);
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: viewRef.current.zoom };
    }
  }

  function movePinch(event: PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return false;
    const previous = pointers.current.get(event.pointerId)!;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size < 2 || !pinch.current) return false;
    const [a, b] = [...pointers.current.values()] as [Point, Point];
    const rect = svgRef.current!.getBoundingClientRect();
    const current = viewRef.current;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const zoom = Math.min(
      Math.max(pinch.current.zoom * (dist / pinch.current.dist), MIN_ZOOM),
      MAX_ZOOM,
    );
    // Le milieu des doigts reste sur le même point du plan ; son déplacement fait défiler la vue.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const prevMid = {
      x: mid.x - (event.clientX - previous.x) / 2,
      y: mid.y - (event.clientY - previous.y) / 2,
    };
    const fx = (prevMid.x - rect.left) / rect.width;
    const fy = (prevMid.y - rect.top) / rect.height;
    const px0 = current.x + fx * (floor.width / current.zoom);
    const py0 = current.y + fy * (floor.height / current.zoom);
    const tx = (mid.x - rect.left) / rect.width;
    const ty = (mid.y - rect.top) / rect.height;
    setView(fit(zoom, px0 - tx * (floor.width / zoom), py0 - ty * (floor.height / zoom)));
    return true;
  }

  function releasePointer(event: { pointerId: number }) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  // Un doigt levé hors du plan (sur un bouton de zoom, hors de l'écran) doit aussi être oublié :
  // sinon le plan croirait qu'un pincement est encore en cours et refuserait les gestes suivants.
  useEffect(() => {
    const forget = (event: globalThis.PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
    };
    window.addEventListener('pointerup', forget);
    window.addEventListener('pointercancel', forget);
    return () => {
      window.removeEventListener('pointerup', forget);
      window.removeEventListener('pointercancel', forget);
    };
  }, []);

  const clampCanvas = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, -PLAN_WORLD), PLAN_WORLD),
    y: Math.min(Math.max(p.y, -PLAN_WORLD), PLAN_WORLD),
  });

  function begin(next: Gesture, event: PointerEvent) {
    event.stopPropagation();
    if (pointers.current.size >= 2) return; // pincement en cours : pas de geste d'édition
    frozenRect.current = svgRef.current?.getBoundingClientRect() ?? null;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    gestureRef.current = next;
    setGesture(next);
  }

  function onMove(event: PointerEvent) {
    if (movePinch(event)) return;
    const g = gestureRef.current;
    if (!g) return;
    if (g.type === 'pan') {
      const rect = frozenRect.current ?? svgRef.current!.getBoundingClientRect();
      const k = rect.width / visibleW;
      const dx = (event.clientX - g.start.x) / k;
      const dy = (event.clientY - g.start.y) / k;
      const moved = g.moved || Math.hypot(dx, dy) * scale > DRAG_THRESHOLD_PX;
      const next: Gesture = { ...g, moved };
      gestureRef.current = next;
      setView(fit(view.zoom, g.origin.x - dx, g.origin.y - dy));
      return;
    }
    const p = toPoint(event);
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    const moved = g.moved || Math.hypot(dx, dy) * scale > DRAG_THRESHOLD_PX;

    let next: Gesture;
    switch (g.type) {
      case 'fixture':
        next = {
          ...g,
          moved,
          current: clampCanvas({ x: g.fixture.x + dx, y: g.fixture.y + dy }),
        };
        break;
      case 'board':
        next = {
          ...g,
          moved,
          current: clampCanvas({ x: g.board.x + dx, y: g.board.y + dy }),
        };
        break;
      case 'room':
        next = { ...g, moved, current: moveRect(g.room, dx, dy, canvas) };
        break;
      case 'handle':
        next = { ...g, moved, current: resizeRect(g.room, g.handle, dx, dy, canvas) };
        break;
      case 'draw':
        next = { ...g, moved, current: rectFromCorners(g.start, clampCanvas(p)) };
        break;
      case 'background':
        next = { ...g, moved, current: { x: g.origin.x + dx, y: g.origin.y + dy } };
        break;
    }
    gestureRef.current = next;
    setGesture(next);
  }

  function onUp(event?: PointerEvent) {
    if (event) releasePointer(event);
    const g = gestureRef.current;
    gestureRef.current = null;
    frozenRect.current = null;
    setGesture(null);
    if (!g) return;
    const cb = propsRef.current;

    if (g.type === 'pan') {
      if (!g.moved) cb.onSelect(null);
      return;
    }

    if (g.type === 'background') {
      if (g.moved) cb.onBackgroundMoved({ x: round(g.current.x), y: round(g.current.y) });
      else cb.onSelect(null);
      return;
    }
    if (!g.moved) return; // simple appui : la sélection a déjà eu lieu au pointerdown

    switch (g.type) {
      case 'board':
        // Un tableau se pose n'importe où : pas besoin d'être dans une pièce.
        cb.onBoardMoved(g.board, { x: round(g.current.x), y: round(g.current.y) });
        break;
      case 'fixture': {
        const room = roomAt(floor.rooms, g.current);
        if (!room) cb.onFixtureRefused();
        else
          cb.onFixtureDropped(g.fixture, {
            x: round(g.current.x),
            y: round(g.current.y),
            roomId: room.id,
          });
        break;
      }
      case 'room':
        cb.onRoomChanged(g.room, roundRect(g.current));
        break;
      case 'handle':
        cb.onRoomChanged(g.room, roundRect(g.current));
        break;
      case 'draw':
        if (g.current.w < MIN_ROOM_SIZE || g.current.h < MIN_ROOM_SIZE) cb.onRoomTooSmall();
        else cb.onRoomDrawn(roundRect(g.current));
        break;
    }
  }

  // Annulation d'un geste en cours (perte du pointeur, Échap).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && gestureRef.current) {
        gestureRef.current = null;
        frozenRect.current = null;
        setGesture(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const editable = canEdit;

  function onBackgroundDown(event: PointerEvent) {
    const p = toPoint(event);
    if (editable && mode === 'draw') {
      begin(
        { type: 'draw', start: p, current: { x: p.x, y: p.y, w: 0, h: 0 }, moved: false },
        event,
      );
    } else if (editable && mode === 'image' && floor.backgroundImageId && !floor.backgroundLocked) {
      begin(
        {
          type: 'background',
          start: p,
          origin: { x: floor.backgroundX, y: floor.backgroundY },
          current: { x: floor.backgroundX, y: floor.backgroundY },
          moved: false,
        },
        event,
      );
    } else {
      // Par défaut, glisser le fond déplace la vue (souris comme doigt) ; un simple appui désélectionne.
      begin(
        {
          type: 'pan',
          start: { x: event.clientX, y: event.clientY },
          origin: { x: view.x, y: view.y },
          moved: false,
        },
        event,
      );
    }
  }

  const activate = (event: KeyboardEvent, run: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      run();
    }
  };

  // --- Rendu ------------------------------------------------------------------------------------------
  const bg = floor.background;
  const bgPos =
    gesture?.type === 'background'
      ? gesture.current
      : { x: floor.backgroundX, y: floor.backgroundY };

  const roomRect = (room: Room): Rect => {
    if (gesture?.type === 'room' && gesture.room.id === room.id) return gesture.current;
    if (gesture?.type === 'handle' && gesture.room.id === room.id) return gesture.current;
    return room;
  };

  const markerR = px(17);
  const selectedRoom =
    selected?.type === 'room' ? floor.rooms.find((r) => r.id === selected.id) : undefined;

  return (
    <div className={styles.stage}>
      <svg
        ref={svgRef}
        data-plan-canvas
        className={`${styles.canvas} ${mode === 'draw' && editable ? styles.drawing : ''} ${
          editable ? styles.editable : ''
        }`}
        viewBox={`${view.x} ${view.y} ${visibleW} ${visibleH}`}
        style={{ aspectRatio: `${floor.width} / ${floor.height}` }}
        role="application"
        aria-label={`Plan : ${floor.name}`}
        data-view-x={view.x}
        data-view-y={view.y}
        data-view-zoom={view.zoom}
        onPointerDownCapture={trackPointers}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={(event) => {
          releasePointer(event);
          gestureRef.current = null;
          setGesture(null);
        }}
      >
        <defs>
          <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e3e9f5" strokeWidth={px(1)} />
          </pattern>
        </defs>

        {/* Le fond couvre la zone visible : le plan n'a pas de bord. */}
        <rect
          x={view.x}
          y={view.y}
          width={visibleW}
          height={visibleH}
          fill="var(--color-surface)"
          onPointerDown={onBackgroundDown}
        />
        <rect
          x={view.x}
          y={view.y}
          width={visibleW}
          height={visibleH}
          fill="url(#plan-grid)"
          pointerEvents="none"
        />
        {/* Repère : le cadrage de départ du plan, à titre indicatif. */}
        <rect
          x={0}
          y={0}
          width={floor.width}
          height={floor.height}
          fill="none"
          stroke="#c9d1e3"
          strokeWidth={px(1)}
          strokeDasharray={`${px(6)} ${px(5)}`}
          pointerEvents="none"
        />

        {floor.backgroundImageId && bg && (
          <image
            href={photoUrl(floor.backgroundImageId)}
            x={bgPos.x}
            y={bgPos.y}
            width={bg.width * floor.backgroundScale}
            height={bg.height * floor.backgroundScale}
            opacity={floor.backgroundOpacity}
            preserveAspectRatio="none"
            pointerEvents="none"
            data-testid="plan-background"
          />
        )}

        {floor.rooms.map((room) => {
          const rect = roomRect(room);
          const isSelected = selected?.type === 'room' && selected.id === room.id;
          return (
            <g
              key={room.id}
              role="button"
              tabIndex={0}
              aria-label={`Pièce ${room.name}`}
              aria-pressed={isSelected}
              className={styles.room}
              onKeyDown={(event) => {
                const step = ARROWS[event.key];
                if (step && editable && isSelected) {
                  // Alternative au glisser : flèches = déplacer, Maj + flèches = redimensionner.
                  event.preventDefault();
                  const next = event.shiftKey
                    ? {
                        ...room,
                        w: Math.max(room.w + step.x * KEY_STEP, MIN_ROOM_SIZE),
                        h: Math.max(room.h + step.y * KEY_STEP, MIN_ROOM_SIZE),
                      }
                    : moveRect(room, step.x * KEY_STEP, step.y * KEY_STEP);
                  if (
                    next.x !== room.x ||
                    next.y !== room.y ||
                    next.w !== room.w ||
                    next.h !== room.h
                  ) {
                    props.onRoomChanged(room, { x: next.x, y: next.y, w: next.w, h: next.h });
                  }
                  return;
                }
                activate(event, () => props.onSelect({ type: 'room', id: room.id }));
              }}
              onPointerDown={(event) => {
                if ((mode === 'draw' || mode === 'image') && editable) {
                  // Le dessin et le déplacement de l'image démarrent sur le fond, même sous une pièce.
                  onBackgroundDown(event);
                  return;
                }
                props.onSelect({ type: 'room', id: room.id });
                if (editable) {
                  begin(
                    { type: 'room', room, start: toPoint(event), current: room, moved: false },
                    event,
                  );
                } else event.stopPropagation();
              }}
            >
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                fill="#ffffff"
                fillOpacity={bg ? 0.55 : 1}
                stroke={isSelected ? '#0f5bff' : '#9fb0d4'}
                strokeWidth={px(isSelected ? 3 : 2)}
              />
              <text
                x={rect.x + px(8)}
                y={rect.y + px(16)}
                fontSize={px(12)}
                fontWeight={800}
                fill="#0d1b3d"
                pointerEvents="none"
              >
                {room.name}
              </text>
            </g>
          );
        })}

        {floor.boards.map((board) => {
          const dragging = gesture?.type === 'board' && gesture.board.id === board.id;
          const at = dragging ? gesture.current : board;
          const isSelected = selected?.type === 'board' && selected.id === board.id;
          const half = px(20);
          return (
            <g
              key={board.id}
              role="button"
              tabIndex={0}
              aria-label={`Tableau ${board.name}`}
              aria-pressed={isSelected}
              className={styles.fixture}
              data-board={board.id}
              onKeyDown={(event) =>
                activate(event, () => props.onSelect({ type: 'board', id: board.id }))
              }
              onPointerDown={(event) => {
                if ((mode === 'draw' || mode === 'image') && editable) {
                  onBackgroundDown(event);
                  return;
                }
                props.onSelect({ type: 'board', id: board.id });
                if (editable) {
                  begin(
                    {
                      type: 'board',
                      board,
                      start: toPoint(event),
                      current: { x: board.x, y: board.y },
                      moved: false,
                    },
                    event,
                  );
                } else event.stopPropagation();
              }}
            >
              {isSelected && (
                <rect
                  x={at.x - half - px(5)}
                  y={at.y - half - px(5)}
                  width={(half + px(5)) * 2}
                  height={(half + px(5)) * 2}
                  rx={px(12)}
                  fill="none"
                  stroke="#c5f26a"
                  strokeWidth={px(3)}
                />
              )}
              <rect
                x={at.x - half}
                y={at.y - half}
                width={half * 2}
                height={half * 2}
                rx={px(9)}
                fill="#0d1b3d"
                stroke={isSelected ? '#0f5bff' : '#0d1b3d'}
                strokeWidth={px(2)}
              />
              <g style={{ color: '#ffffff' }} pointerEvents="none">
                <Icon
                  name="boards"
                  size={px(22)}
                  x={at.x - px(11)}
                  y={at.y - px(11)}
                  strokeWidth={2.2}
                />
              </g>
              <text
                x={at.x}
                y={at.y + half + px(15)}
                textAnchor="middle"
                fontSize={px(12)}
                fontWeight={800}
                fill="#0d1b3d"
                pointerEvents="none"
              >
                {board.name}
              </text>
              <rect
                x={at.x - px(22)}
                y={at.y - px(22)}
                width={px(44)}
                height={px(44)}
                fill="transparent"
              />
            </g>
          );
        })}

        {floor.fixtures.map((fixture) => {
          const dragging = gesture?.type === 'fixture' && gesture.fixture.id === fixture.id;
          const at = dragging ? gesture.current : fixture;
          const state = fixtureState(fixture, highlightBreakerId);
          const isSelected = selected?.type === 'fixture' && selected.id === fixture.id;
          const label = [
            fixture.label,
            FIXTURE_KIND_LABEL[fixture.kind],
            state === 'unlinked'
              ? 'disjoncteur à identifier'
              : state === 'highlighted'
                ? 'sur le circuit sélectionné'
                : 'sur un autre circuit',
          ].join(', ');
          return (
            <g
              key={fixture.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={isSelected}
              className={styles.fixture}
              data-state={state}
              onKeyDown={(event) =>
                activate(event, () => props.onSelect({ type: 'fixture', id: fixture.id }))
              }
              onPointerDown={(event) => {
                if ((mode === 'draw' || mode === 'image') && editable) {
                  onBackgroundDown(event);
                  return;
                }
                props.onSelect({ type: 'fixture', id: fixture.id });
                if (editable) {
                  begin(
                    {
                      type: 'fixture',
                      fixture,
                      start: toPoint(event),
                      current: fixture,
                      moved: false,
                    },
                    event,
                  );
                } else event.stopPropagation();
              }}
            >
              {isSelected && (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={markerR + px(6)}
                  fill="none"
                  stroke="#0d1b3d"
                  strokeWidth={px(3)}
                />
              )}
              {state === 'highlighted' && (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={markerR + px(3)}
                  fill="none"
                  stroke="#c5f26a"
                  strokeWidth={px(3)}
                />
              )}
              <circle
                cx={at.x}
                cy={at.y}
                r={markerR}
                fill={
                  state === 'highlighted' ? '#0f5bff' : state === 'unlinked' ? '#fff1de' : '#ffffff'
                }
                stroke={
                  state === 'unlinked' ? '#b45309' : state === 'linked' ? '#56627f' : '#0f5bff'
                }
                strokeWidth={px(2)}
                strokeDasharray={state === 'unlinked' ? `${px(4)} ${px(3)}` : undefined}
              />
              {state === 'unlinked' ? (
                <text
                  x={at.x}
                  y={at.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={px(16)}
                  fontWeight={800}
                  fill="#7a3b00"
                  pointerEvents="none"
                >
                  ?
                </text>
              ) : (
                <g
                  style={{ color: state === 'highlighted' ? '#ffffff' : '#0d1b3d' }}
                  pointerEvents="none"
                >
                  <Icon
                    name={FIXTURE_KIND_ICON[fixture.kind]}
                    size={px(18)}
                    x={at.x - px(9)}
                    y={at.y - px(9)}
                    strokeWidth={2.4}
                  />
                </g>
              )}
              {/* Zone de toucher élargie (≥ 44 px). */}
              <circle cx={at.x} cy={at.y} r={px(22)} fill="transparent" />
            </g>
          );
        })}

        {editable && mode === 'select' && selectedRoom && (
          <g>
            {HANDLES.map((handle) => {
              const rect = roomRect(selectedRoom);
              const cx = handle.endsWith('w') ? rect.x : rect.x + rect.w;
              const cy = handle.startsWith('n') ? rect.y : rect.y + rect.h;
              return (
                <g
                  key={handle}
                  className={styles.handle}
                  role="presentation"
                  onPointerDown={(event) =>
                    begin(
                      {
                        type: 'handle',
                        room: selectedRoom,
                        handle,
                        start: toPoint(event),
                        current: selectedRoom,
                        moved: false,
                      },
                      event,
                    )
                  }
                >
                  <circle cx={cx} cy={cy} r={px(22)} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={px(8)}
                    fill="#ffffff"
                    stroke="#0f5bff"
                    strokeWidth={px(3)}
                  />
                </g>
              );
            })}
          </g>
        )}

        {gesture?.type === 'draw' && gesture.moved && (
          <rect
            x={gesture.current.x}
            y={gesture.current.y}
            width={gesture.current.w}
            height={gesture.current.h}
            fill="#0f5bff"
            fillOpacity={0.12}
            stroke="#0f5bff"
            strokeWidth={px(2)}
            strokeDasharray={`${px(6)} ${px(4)}`}
            pointerEvents="none"
          />
        )}
      </svg>
      <div className={styles.zoom} role="group" aria-label="Zoom du plan">
        <button
          type="button"
          aria-label="Zoom avant"
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => zoomAt(ZOOM_STEP)}
        >
          <Icon name="plus" size={18} strokeWidth={2.6} />
        </button>
        <button
          type="button"
          aria-label="Zoom arrière"
          disabled={view.zoom <= MIN_ZOOM}
          onClick={() => zoomAt(1 / ZOOM_STEP)}
        >
          <Icon name="minus" size={18} strokeWidth={2.6} />
        </button>
        <button type="button" aria-label="Voir tout le plan" onClick={showAll}>
          <Icon name="refresh" size={18} strokeWidth={2.4} />
        </button>
        {view.zoom !== 1 && (
          <output className={styles.level} aria-live="polite">
            {Math.round(view.zoom * 100)} %
          </output>
        )}
      </div>
    </div>
  );
}
