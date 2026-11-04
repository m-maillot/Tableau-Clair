import type {
  BulkCreateElementsInput,
  PhotoAnalysisResponse,
  ProposedElementDto,
  Row,
} from '@tableau-clair/contracts';
import { validateSpan, type ProposalConflict } from '@tableau-clair/domain';

/** Appareil proposé, tel que l'utilisateur le relit : coché ou non, modifiable. */
export interface ReviewItem {
  key: string;
  rowIndex: number;
  /** Faux pour un appareil qui posait problème à l'arrivée de la proposition. */
  checked: boolean;
  element: Omit<ProposedElementDto, 'conflict'>;
}

export type Conflicts = Map<string, ProposalConflict>;

export function initialItems(response: PhotoAnalysisResponse): ReviewItem[] {
  return response.rows.flatMap((row) =>
    row.elements.map(({ conflict, ...element }, i) => ({
      key: `${row.index}-${i}`,
      rowIndex: row.index,
      checked: conflict === null,
      element,
    })),
  );
}

/**
 * Conflits de la sélection courante : un appareil coché qui chevauche un appareil existant ou un
 * appareil coché plus à gauche, ou qui dépasse la rangée. Recalculé à chaque modification, avec les
 * mêmes règles que le serveur (le serveur reste l'arbitre à l'ajout).
 */
export function findConflicts(items: readonly ReviewItem[], rows: readonly Row[]): Conflicts {
  const conflicts: Conflicts = new Map();
  for (const row of rows) {
    const taken = row.elements.map((e) => ({ id: e.id, position: e.position, width: e.width }));
    const ordered = items
      .filter((item) => item.rowIndex === row.index)
      .sort((a, b) => a.element.position - b.element.position);
    for (const item of ordered) {
      const problem = validateSpan({ capacity: row.capacity, elements: taken }, item.element);
      if (problem) {
        // Un appareil décoché ne bloque personne, mais on signale quand même qu'il ne tiendrait pas.
        conflicts.set(item.key, problem.code === 'overlap' ? 'overlap' : 'out_of_bounds');
      } else if (item.checked) {
        taken.push({ id: item.key, position: item.element.position, width: item.element.width });
      }
    }
  }
  return conflicts;
}

/** Appareils qui seront réellement ajoutés : cochés et sans conflit. */
export function selectedItems(items: readonly ReviewItem[], conflicts: Conflicts): ReviewItem[] {
  return items.filter((item) => item.checked && !conflicts.has(item.key));
}

export function toBulkInput(selected: readonly ReviewItem[]): BulkCreateElementsInput {
  return {
    elements: selected.map(({ rowIndex, element }) => ({
      rowIndex,
      position: element.position,
      width: element.width,
      kind: element.kind,
      label: element.label,
      ...(element.ratingA !== undefined ? { ratingA: element.ratingA } : {}),
      ...(element.poles !== undefined ? { poles: element.poles } : {}),
      ...(element.curve !== undefined ? { curve: element.curve } : {}),
      ...(element.sensitivityMa !== undefined ? { sensitivityMa: element.sensitivityMa } : {}),
      ...(element.rcdType !== undefined ? { rcdType: element.rcdType } : {}),
      ...(element.brand ? { brand: element.brand } : {}),
      ...(element.model ? { model: element.model } : {}),
    })),
  };
}
