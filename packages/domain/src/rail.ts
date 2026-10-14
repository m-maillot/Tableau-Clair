import { err, ok, type Result } from './result';

/** Intervalle de modules occupé par un élément : [position, position + width[ */
export interface Span {
  position: number;
  width: number;
}

/** Forme minimale d'un élément posé sur un rail ; le reste de l'élément est conservé tel quel. */
export interface Placed extends Span {
  id: string;
}

/** État d'une rangée : sa capacité en modules et ce qui y est posé. */
export interface RowState<T extends Placed = Placed> {
  capacity: number;
  elements: readonly T[];
}

export type PlacementError =
  | { code: 'invalid_width' }
  | { code: 'invalid_position' }
  | { code: 'out_of_bounds'; capacity: number }
  | { code: 'overlap'; with: string }
  | { code: 'not_found'; id: string }
  | { code: 'duplicate_id'; id: string };

export type PlacementResult<T> = Result<T, PlacementError>;

// --- Primitives -----------------------------------------------------------------------------

/** Vrai si l'élément tient entièrement dans une rangée de `capacity` modules. */
export function fitsInRow(span: Span, capacity: number): boolean {
  return span.width >= 1 && span.position >= 0 && span.position + span.width <= capacity;
}

/** Vrai si deux éléments d'une même rangée se chevauchent. */
export function overlaps(a: Span, b: Span): boolean {
  return a.position < b.position + b.width && b.position < a.position + a.width;
}

const byPosition = (a: Span, b: Span) => a.position - b.position;

const sorted = <T extends Placed>(elements: readonly T[]): T[] => [...elements].sort(byPosition);

/**
 * Vérifie qu'un intervalle peut être posé dans la rangée.
 * `ignoreId` exclut un élément du contrôle (l'élément lui-même lors d'un déplacement).
 */
export function validateSpan(
  row: RowState,
  span: Span,
  ignoreId?: string,
): PlacementError | undefined {
  if (!Number.isInteger(span.width) || span.width < 1) return { code: 'invalid_width' };
  if (!Number.isInteger(span.position) || span.position < 0) return { code: 'invalid_position' };
  if (!fitsInRow(span, row.capacity)) return { code: 'out_of_bounds', capacity: row.capacity };
  const clash = row.elements.find((e) => e.id !== ignoreId && overlaps(e, span));
  if (clash) return { code: 'overlap', with: clash.id };
  return undefined;
}

// --- Opérations (immuables : elles renvoient une nouvelle rangée) --------------------------------

/** Pose un nouvel élément. */
export function placeElement<T extends Placed>(
  row: RowState<T>,
  element: T,
): PlacementResult<RowState<T>> {
  if (row.elements.some((e) => e.id === element.id)) {
    return err({ code: 'duplicate_id', id: element.id });
  }
  const error = validateSpan(row, element);
  if (error) return err(error);
  return ok({ ...row, elements: sorted([...row.elements, element]) });
}

/** Déplace un élément à une position absolue de la même rangée. */
export function moveElement<T extends Placed>(
  row: RowState<T>,
  id: string,
  position: number,
): PlacementResult<RowState<T>> {
  return update(row, id, (element) => ({ ...element, position }));
}

/** Déplace un élément de `delta` modules (← → : valeurs négatives ou positives). */
export function moveElementBy<T extends Placed>(
  row: RowState<T>,
  id: string,
  delta: number,
): PlacementResult<RowState<T>> {
  return update(row, id, (element) => ({ ...element, position: element.position + delta }));
}

/** Change le nombre de modules occupés ; l'élément garde sa position. */
export function resizeElement<T extends Placed>(
  row: RowState<T>,
  id: string,
  width: number,
): PlacementResult<RowState<T>> {
  return update(row, id, (element) => ({ ...element, width }));
}

/** Retire un élément ; les modules libérés redeviennent libres. */
export function removeElement<T extends Placed>(
  row: RowState<T>,
  id: string,
): PlacementResult<RowState<T>> {
  if (!row.elements.some((e) => e.id === id)) return err({ code: 'not_found', id });
  return ok({ ...row, elements: row.elements.filter((e) => e.id !== id) });
}

/**
 * Déplace un élément vers une autre rangée (ou la même) à la position donnée.
 * Les deux rangées sont retournées ; rien n'est modifié si le déplacement est refusé.
 */
export function moveToRow<T extends Placed>(
  source: RowState<T>,
  target: RowState<T>,
  id: string,
  position: number,
): PlacementResult<{ source: RowState<T>; target: RowState<T> }> {
  const element = source.elements.find((e) => e.id === id);
  if (!element) return err({ code: 'not_found', id });

  const moved = { ...element, position };
  const error = validateSpan(target, moved);
  if (error) return err(error);

  return ok({
    source: { ...source, elements: source.elements.filter((e) => e.id !== id) },
    target: { ...target, elements: sorted([...target.elements, moved]) },
  });
}

function update<T extends Placed>(
  row: RowState<T>,
  id: string,
  change: (element: T) => T,
): PlacementResult<RowState<T>> {
  const element = row.elements.find((e) => e.id === id);
  if (!element) return err({ code: 'not_found', id });

  const next = change(element);
  const error = validateSpan(row, next, id);
  if (error) return err(error);

  return ok({ ...row, elements: sorted(row.elements.map((e) => (e.id === id ? next : e))) });
}

// --- Occupation et modules libres ------------------------------------------------------------------

export interface Occupancy {
  capacity: number;
  /** Modules occupés, réserves comprises. */
  used: number;
  free: number;
}

/** Occupation d'une rangée ; une réserve occupe des modules, un module libre non. */
export function rowOccupancy(row: RowState): Occupancy {
  const used = row.elements.reduce((total, e) => total + e.width, 0);
  return { capacity: row.capacity, used, free: row.capacity - used };
}

/** Plages de modules libres contiguës, de gauche à droite. */
export function freeSlots(row: RowState): Span[] {
  const slots: Span[] = [];
  let cursor = 0;
  for (const element of sorted(row.elements)) {
    if (element.position > cursor) {
      slots.push({ position: cursor, width: element.position - cursor });
    }
    cursor = Math.max(cursor, element.position + element.width);
  }
  if (cursor < row.capacity) slots.push({ position: cursor, width: row.capacity - cursor });
  return slots;
}

/**
 * Nombre de modules libres consécutifs à partir de `position` (0 si le module est occupé
 * ou hors rangée). Sert à borner la largeur d'un élément ajouté depuis un module libre.
 */
export function maxWidthAt(row: RowState, position: number, ignoreId?: string): number {
  if (!Number.isInteger(position) || position < 0 || position >= row.capacity) return 0;
  let limit = row.capacity;
  for (const element of row.elements) {
    if (element.id === ignoreId) continue;
    if (element.position <= position && position < element.position + element.width) return 0;
    if (element.position > position) limit = Math.min(limit, element.position);
  }
  return limit - position;
}

/** Largeurs, parmi `candidates`, qui tiennent à partir de `position`. */
export function allowedWidthsAt(
  row: RowState,
  position: number,
  candidates: readonly number[],
): number[] {
  const max = maxWidthAt(row, position);
  return candidates.filter((width) => width >= 1 && width <= max);
}

/**
 * Position valide la plus proche de `preferred` pour un élément de `width` modules,
 * ou `null` si aucune plage libre n'est assez large. Sert à changer un élément de rangée.
 */
export function nearestFreePosition(
  row: RowState,
  width: number,
  preferred: number,
  ignoreId?: string,
): number | null {
  if (!Number.isInteger(width) || width < 1) return null;
  const others: RowState = {
    capacity: row.capacity,
    elements: ignoreId ? row.elements.filter((e) => e.id !== ignoreId) : row.elements,
  };

  let best: number | null = null;
  for (const slot of freeSlots(others)) {
    if (slot.width < width) continue;
    const candidate = Math.min(
      Math.max(preferred, slot.position),
      slot.position + slot.width - width,
    );
    if (best === null || Math.abs(candidate - preferred) < Math.abs(best - preferred)) {
      best = candidate;
    }
  }
  return best;
}

// --- Géométrie du tableau ----------------------------------------------------------------------------

/** Capacité minimale de la rangée : jusqu'au bout de son dernier élément (au moins 1). */
export function minRowCapacity(row: RowState): number {
  return Math.max(1, ...row.elements.map((e) => e.position + e.width));
}

/** Change la capacité d'une rangée ; refusé si des éléments dépasseraient. */
export function setRowCapacity<T extends Placed>(
  row: RowState<T>,
  capacity: number,
): PlacementResult<RowState<T>> {
  if (!Number.isInteger(capacity) || capacity < 1) return err({ code: 'invalid_width' });
  if (capacity < minRowCapacity(row)) return err({ code: 'out_of_bounds', capacity });
  return ok({ ...row, capacity });
}

// --- Redimensionnement d'un tableau ------------------------------------------------------------------

export interface ResizeRail {
  /** Rang de la rangée dans le tableau (0 = en haut). */
  index: number;
  elements: readonly (Placed & { label?: string })[];
}

export interface RowsProblem {
  /** Nombre de rangées en dessous duquel on ne peut pas descendre. */
  minimum: number;
  /** Rangée non vide qui l'impose (0-indexée) et son nombre d'éléments. */
  rowIndex: number;
  elementCount: number;
}

export interface ModulesProblem {
  /** Nombre de modules par rangée en dessous duquel on ne peut pas descendre. */
  minimum: number;
  /** Rangée la plus occupée (0-indexée) et l'élément qui va jusqu'au bout. */
  rowIndex: number;
  element: { id: string; label?: string; start: number; end: number } | undefined;
}

export interface ResizeAnalysis {
  rows: RowsProblem | null;
  modules: ModulesProblem | null;
  /** Éléments qui sortiraient du rail avec le nombre de modules visé. */
  overflowingElementIds: string[];
}

/**
 * Que se passe-t-il si le tableau passe à `rowCount` rangées de `modulesPerRow` modules ?
 * Une rangée ne se retire que vide, et une rangée ne se raccourcit pas sous son dernier élément.
 */
export function analyzeBoardResize(
  rails: readonly ResizeRail[],
  target: { rowCount: number; modulesPerRow: number },
): ResizeAnalysis {
  const nonEmpty = rails.filter((r) => r.elements.length > 0);

  // Rangées : on ne peut retirer que des rangées vides, en partant du bas.
  const lowest = nonEmpty.reduce<ResizeRail | undefined>(
    (found, rail) => (!found || rail.index > found.index ? rail : found),
    undefined,
  );
  const minRows = Math.max(1, lowest ? lowest.index + 1 : 1);
  const rowsProblem: RowsProblem | null =
    lowest && target.rowCount < minRows
      ? { minimum: minRows, rowIndex: lowest.index, elementCount: lowest.elements.length }
      : null;

  // Modules : la plus longue des rangées conservées fixe le minimum.
  const kept = rails.filter((r) => r.index < Math.max(target.rowCount, minRows));
  let minimum = 1;
  let widest: { rail: ResizeRail; end: number } | undefined;
  for (const rail of kept) {
    const end = Math.max(0, ...rail.elements.map((e) => e.position + e.width));
    if (end > minimum) {
      minimum = end;
      widest = { rail, end };
    }
  }

  const modulesProblem: ModulesProblem | null =
    widest && target.modulesPerRow < minimum
      ? (() => {
          const last = widest.rail.elements.find((e) => e.position + e.width === widest.end);
          return {
            minimum,
            rowIndex: widest.rail.index,
            element: last
              ? {
                  id: last.id,
                  ...(last.label !== undefined ? { label: last.label } : {}),
                  start: last.position + 1,
                  end: last.position + last.width,
                }
              : undefined,
          };
        })()
      : null;

  const overflowingElementIds = kept.flatMap((rail) =>
    rail.elements.filter((e) => e.position + e.width > target.modulesPerRow).map((e) => e.id),
  );

  return { rows: rowsProblem, modules: modulesProblem, overflowingElementIds };
}
