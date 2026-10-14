import type { ModulesProblem, RowsProblem } from '@tableau-clair/domain';
import { plural } from '../home/format';

export interface Problem {
  title: string;
  body: string;
}

function positionLabel(start: number, end: number) {
  return start === end ? `position ${start}` : `position ${start}–${end}`;
}

/** Réduction des modules refusée : cite le minimum, la rangée et l'élément qui va jusqu'au bout. */
export function modulesProblemMessage(problem: ModulesProblem): Problem {
  const element = problem.element;
  const detail = element
    ? ` (${element.label ? `« ${element.label} » en ` : ''}${positionLabel(element.start, element.end)})`
    : '';
  return {
    title: `Impossible de descendre sous ${problem.minimum} modules.`,
    body: `La rangée ${problem.rowIndex + 1} en occupe ${problem.minimum}${detail}. Déplacez ou retirez des éléments avant de réduire.`,
  };
}

/** Retrait d'une rangée refusé : une rangée ne se retire que vide. */
export function rowsProblemMessage(problem: RowsProblem): Problem {
  return {
    title: `Impossible de descendre sous ${problem.minimum} ${plural(problem.minimum, 'rangée', 'rangées')}.`,
    body: `La rangée ${problem.rowIndex + 1} contient ${problem.elementCount} ${plural(
      problem.elementCount,
      'élément',
      'éléments',
    )}. Déplacez-les ou retirez-les avant de supprimer la rangée.`,
  };
}
