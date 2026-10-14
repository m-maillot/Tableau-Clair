/** Intervalle de modules occupé par un élément : [position, position + width[ */
export interface Span {
  position: number;
  width: number;
}

/** Vrai si l'élément tient entièrement dans une rangée de `capacity` modules. */
export function fitsInRow(span: Span, capacity: number): boolean {
  return span.width >= 1 && span.position >= 0 && span.position + span.width <= capacity;
}

/** Vrai si deux éléments d'une même rangée se chevauchent. */
export function overlaps(a: Span, b: Span): boolean {
  return a.position < b.position + b.width && b.position < a.position + a.width;
}
