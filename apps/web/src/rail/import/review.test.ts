import type { PhotoAnalysisResponse, Row } from '@tableau-clair/contracts';
import { describe, expect, it } from 'vitest';
import { findConflicts, initialItems, selectedItems, toBulkInput, type ReviewItem } from './review';

const row = (index: number, elements: Row['elements'] = [], capacity = 12) =>
  ({ index, capacity, elements, id: `row-${index}` }) as unknown as Row;

const existing = (position: number, width = 1) =>
  ({ id: `e-${position}`, position, width }) as unknown as Row['elements'][number];

const item = (
  rowIndex: number,
  position: number,
  overrides: Partial<ReviewItem> & { width?: number } = {},
): ReviewItem => ({
  key: `${rowIndex}-${position}`,
  rowIndex,
  checked: overrides.checked ?? true,
  element: {
    position,
    width: overrides.width ?? 1,
    kind: 'breaker',
    label: `Appareil ${position}`,
    ratingA: 16,
    confidence: 'high',
  },
});

describe('initialItems', () => {
  it('décoche les appareils en conflit et retire le champ de la ligne', () => {
    const response = {
      rows: [
        {
          index: 1,
          elements: [
            {
              position: 0,
              width: 1,
              kind: 'breaker',
              label: 'A',
              confidence: 'high',
              conflict: null,
            },
            {
              position: 1,
              width: 1,
              kind: 'breaker',
              label: 'B',
              confidence: 'low',
              conflict: 'overlap',
            },
          ],
        },
      ],
    } as unknown as PhotoAnalysisResponse;
    const items = initialItems(response);
    expect(items.map((i) => [i.rowIndex, i.checked])).toEqual([
      [1, true],
      [1, false],
    ]);
    expect(items[0]!.element).not.toHaveProperty('conflict');
  });
});

describe('findConflicts', () => {
  it('ne signale rien quand tout tient', () => {
    expect(findConflicts([item(0, 0), item(0, 1)], [row(0)]).size).toBe(0);
  });

  it('signale le chevauchement avec un appareil existant', () => {
    const conflicts = findConflicts([item(0, 2), item(0, 3)], [row(0, [existing(2)])]);
    expect([...conflicts]).toEqual([['0-2', 'overlap']]);
  });

  it('signale un dépassement de la rangée', () => {
    const conflicts = findConflicts([item(0, 11, { width: 2 })], [row(0)]);
    expect(conflicts.get('0-11')).toBe('out_of_bounds');
  });

  it('un appareil décoché libère sa place pour les autres', () => {
    const items = [item(0, 0, { width: 2, checked: false }), item(0, 1)];
    expect(findConflicts(items, [row(0)]).size).toBe(0);
  });

  it('réagit à une modification de position', () => {
    const items = [item(0, 0), item(0, 1)];
    items[1]!.element.position = 0;
    expect(findConflicts(items, [row(0)]).size).toBe(1);
  });
});

describe('selectedItems / toBulkInput', () => {
  it('ne retient que les appareils cochés et sans conflit', () => {
    const items = [item(0, 0), item(0, 1, { checked: false }), item(0, 2)];
    const selected = selectedItems(items, new Map([['0-2', 'overlap' as const]]));
    expect(selected.map((i) => i.key)).toEqual(['0-0']);
  });

  it('construit le corps du lot sans champs vides', () => {
    const [selected] = [item(0, 4)];
    const { elements } = toBulkInput([selected!]);
    expect(elements[0]).toEqual({
      rowIndex: 0,
      position: 4,
      width: 1,
      kind: 'breaker',
      label: 'Appareil 4',
      ratingA: 16,
    });
  });
});
