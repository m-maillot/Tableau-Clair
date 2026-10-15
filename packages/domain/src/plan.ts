/**
 * Géométrie du plan du logement : pièces rectangulaires et équipements posés dedans.
 * Toutes les coordonnées sont en unités de canevas (voir `Floor.width` / `Floor.height`).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Le plan est illimité en pratique : les coordonnées restent bornées à ± `PLAN_WORLD` unités
 * pour rester des nombres sains en base et à l'écran.
 */
export const PLAN_WORLD = 100_000;
export const WORLD_BOUNDS: Rect = {
  x: -PLAN_WORLD,
  y: -PLAN_WORLD,
  w: PLAN_WORLD * 2,
  h: PLAN_WORLD * 2,
};

/** Zone de limites : l'origine vaut 0 quand seule la taille est donnée (ancien canevas). */
type Bounds = { x?: number; y?: number; w: number; h: number };

/** Plus petite taille d'une pièce, pour qu'elle reste sélectionnable. */
export const MIN_ROOM_SIZE = 40;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/** Vrai si `inner` est entièrement dans `outer`. */
export function rectWithin(outer: Bounds, inner: Rect): boolean {
  const ox = outer.x ?? 0;
  const oy = outer.y ?? 0;
  return (
    inner.x >= ox &&
    inner.y >= oy &&
    inner.x + inner.w <= ox + outer.w &&
    inner.y + inner.h <= oy + outer.h
  );
}

/** Ramène un point dans un rectangle. */
export function clampPoint(rect: Rect, point: Point): Point {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.w),
    y: clamp(point.y, rect.y, rect.y + rect.h),
  };
}

/** Rectangle défini par deux coins quelconques (dessin à la souris ou au doigt). */
export function rectFromCorners(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Déplace un rectangle sans le laisser sortir des limites (le plan entier par défaut). */
export function moveRect(rect: Rect, dx: number, dy: number, canvas: Bounds = WORLD_BOUNDS): Rect {
  const ox = canvas.x ?? 0;
  const oy = canvas.y ?? 0;
  return {
    ...rect,
    x: clamp(rect.x + dx, ox, ox + canvas.w - rect.w),
    y: clamp(rect.y + dy, oy, oy + canvas.h - rect.h),
  };
}

export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Redimensionne par une poignée de coin : le coin opposé reste fixe, la taille minimale est
 * respectée et le rectangle reste dans le canevas.
 */
export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  canvas: Bounds = WORLD_BOUNDS,
  min = MIN_ROOM_SIZE,
): Rect {
  const ox = canvas.x ?? 0;
  const oy = canvas.y ?? 0;
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';

  const fixedX = left ? rect.x + rect.w : rect.x;
  const fixedY = top ? rect.y + rect.h : rect.y;
  const movingX = clamp((left ? rect.x : rect.x + rect.w) + dx, ox, ox + canvas.w);
  const movingY = clamp((top ? rect.y : rect.y + rect.h) + dy, oy, oy + canvas.h);

  // La taille minimale se tient côté du coin mobile, jamais en poussant le coin fixe.
  const x = left ? Math.min(movingX, fixedX - min) : fixedX;
  const y = top ? Math.min(movingY, fixedY - min) : fixedY;
  const x2 = left ? fixedX : Math.max(movingX, fixedX + min);
  const y2 = top ? fixedY : Math.max(movingY, fixedY + min);

  return { x, y, w: x2 - x, h: y2 - y };
}

/** Pièce contenant le point ; la plus petite l'emporte quand elles se chevauchent. */
export function roomAt<T extends Rect>(rooms: readonly T[], point: Point): T | undefined {
  return rooms
    .filter((room) => containsPoint(room, point))
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

/** Les équipements suivent leur pièce quand elle est déplacée. */
export function shiftPoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}
