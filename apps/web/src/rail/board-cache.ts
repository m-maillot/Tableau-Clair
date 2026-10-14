import type { Board, Element, Row } from '@tableau-clair/contracts';

/** Recompose une rangée après un changement : tri par position et modules occupés. */
function settle(row: Row, elements: Element[]): Row {
  const sorted = [...elements].sort((a, b) => a.position - b.position);
  return { ...row, elements: sorted, used: sorted.reduce((total, e) => total + e.width, 0) };
}

export function findElement(
  board: Board,
  elementId: string,
): { element: Element; row: Row } | null {
  for (const row of board.rows) {
    const element = row.elements.find((e) => e.id === elementId);
    if (element) return { element, row };
  }
  return null;
}

/**
 * Remplace (ou insère) un élément : il quitte sa rangée d'origine et rejoint `element.rowId`.
 * Sert aux mises à jour optimistes et à la réconciliation avec la réponse du serveur.
 */
export function putElement(board: Board, element: Element): Board {
  return {
    ...board,
    rows: board.rows.map((row) => {
      const others = row.elements.filter((e) => e.id !== element.id);
      return settle(row, row.id === element.rowId ? [...others, element] : others);
    }),
  };
}

export function dropElement(board: Board, elementId: string): Board {
  return {
    ...board,
    rows: board.rows.map((row) =>
      settle(
        row,
        row.elements.filter((e) => e.id !== elementId),
      ),
    ),
  };
}
