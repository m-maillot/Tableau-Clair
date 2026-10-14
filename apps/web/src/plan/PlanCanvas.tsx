import type { Fixture, PlanFloor, Room } from '@tableau-clair/contracts';
import {
  moveRect,
  rectFromCorners,
  resizeRect,
  roomAt,
  type Handle,
  type Point,
  type Rect,
  MIN_ROOM_SIZE,
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

export type Selection = { type: 'room' | 'fixture'; id: string } | null;
export type Mode = 'select' | 'draw';

/** État d'un équipement vis-à-vis du circuit mis en évidence (spec §7.4). */
export type FixtureState = 'highlighted' | 'linked' | 'unlinked';

export function fixtureState(fixture: Fixture, highlightBreakerId: string | null): FixtureState {
  const breakerId = fixture.link?.breakerId ?? null;
  if (!breakerId) return 'unlinked';
  return highlightBreakerId && breakerId === highlightBreakerId ? 'highlighted' : 'linked';
}

interface PlanCanvasProps {
  floor: PlanFloor;
  mode: Mode;
  canEdit: boolean;
  selected: Selection;
  highlightBreakerId: string | null;
  onSelect: (selection: Selection) => void;
  onFixtureDropped: (fixture: Fixture, to: { x: number; y: number; roomId: string }) => void;
  onFixtureRefused: () => void;
  onRoomChanged: (room: Room, rect: Rect) => void;
  onRoomDrawn: (rect: Rect) => void;
  onRoomTooSmall: () => void;
  onBackgroundMoved: (position: Point) => void;
}

type Gesture =
  | { type: 'fixture'; fixture: Fixture; start: Point; current: Point; moved: boolean }
  | { type: 'room'; room: Room; start: Point; current: Rect; moved: boolean }
  | { type: 'handle'; room: Room; handle: Handle; start: Point; current: Rect; moved: boolean }
  | { type: 'draw'; start: Point; current: Rect; moved: boolean }
  | { type: 'background'; start: Point; origin: Point; current: Point; moved: boolean };

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
  const [scale, setScale] = useState(0.35); // pixels d'écran par unité de plan
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const canvas = { w: floor.width, h: floor.height };

  // Les repères (poignées, marqueurs, texte) gardent une taille constante à l'écran.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setScale(width / floor.width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [floor.width]);

  const px = (n: number) => n / scale;

  function toPoint(event: PointerEvent | globalThis.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    const k = rect.width > 0 ? rect.width / floor.width : 1;
    return { x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k };
  }

  const clampCanvas = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, 0), canvas.w),
    y: Math.min(Math.max(p.y, 0), canvas.h),
  });

  function begin(next: Gesture, event: PointerEvent) {
    event.stopPropagation();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    gestureRef.current = next;
    setGesture(next);
  }

  function onMove(event: PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
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

  function onUp() {
    const g = gestureRef.current;
    gestureRef.current = null;
    setGesture(null);
    if (!g) return;
    const cb = propsRef.current;

    if (g.type === 'background') {
      if (g.moved) cb.onBackgroundMoved({ x: round(g.current.x), y: round(g.current.y) });
      else cb.onSelect(null);
      return;
    }
    if (!g.moved) return; // simple appui : la sélection a déjà eu lieu au pointerdown

    switch (g.type) {
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
    } else if (editable && floor.backgroundImageId && !floor.backgroundLocked) {
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
      props.onSelect(null);
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
    <svg
      ref={svgRef}
      data-plan-canvas
      className={`${styles.canvas} ${mode === 'draw' && editable ? styles.drawing : ''}`}
      viewBox={`0 0 ${floor.width} ${floor.height}`}
      style={{ aspectRatio: `${floor.width} / ${floor.height}` }}
      role="application"
      aria-label={`Plan : ${floor.name}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        gestureRef.current = null;
        setGesture(null);
      }}
    >
      <defs>
        <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e3e9f5" strokeWidth={px(1)} />
        </pattern>
      </defs>

      <rect
        width={floor.width}
        height={floor.height}
        fill="var(--color-surface)"
        onPointerDown={onBackgroundDown}
      />
      <rect width={floor.width} height={floor.height} fill="url(#plan-grid)" pointerEvents="none" />

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
            onKeyDown={(event) =>
              activate(event, () => props.onSelect({ type: 'room', id: room.id }))
            }
            onPointerDown={(event) => {
              if (mode === 'draw' && editable) return; // le dessin démarre sur le fond
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
              if (mode === 'draw' && editable) return;
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
              stroke={state === 'unlinked' ? '#b45309' : state === 'linked' ? '#56627f' : '#0f5bff'}
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
  );
}
