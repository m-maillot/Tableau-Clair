import type { PlanBreaker } from '@tableau-clair/contracts';

type Place = Pick<PlanBreaker, 'boardName' | 'rowIndex' | 'position'>;

/** « Tableau principal · Rangée 1 · module 5 » : où trouver le disjoncteur devant le tableau. */
export const placeOf = (b: Place) =>
  `${b.boardName} · Rangée ${b.rowIndex + 1} · module ${b.position + 1}`;

/** « Prises cuisine · 16 A ». */
export const breakerName = (b: Pick<PlanBreaker, 'label' | 'ratingA'>) =>
  b.ratingA ? `${b.label} · ${b.ratingA} A` : b.label;
