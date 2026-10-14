import type { Board, Element } from '@tableau-clair/contracts';
import { describe, expect, it } from 'vitest';
import { dropElement, findElement, putElement } from './board-cache';

const element = (id: string, rowId: string, position: number, width = 1): Element =>
  ({ id, rowId, position, width, kind: 'breaker', label: id, version: 1 }) as Element;

const board = {
  id: 'b',
  rows: [
    {
      id: 'r0',
      index: 0,
      capacity: 12,
      used: 3,
      elements: [element('a', 'r0', 0, 2), element('b', 'r0', 5)],
    },
    { id: 'r1', index: 1, capacity: 12, used: 1, elements: [element('c', 'r1', 3)] },
  ],
} as unknown as Board;

describe('findElement', () => {
  it('retrouve un élément et sa rangée', () => {
    expect(findElement(board, 'c')?.row.id).toBe('r1');
    expect(findElement(board, 'zz')).toBeNull();
  });
});

describe('putElement', () => {
  it('déplace dans la rangée et garde les éléments triés', () => {
    const next = putElement(board, element('a', 'r0', 8, 2));
    expect(next.rows[0]!.elements.map((e) => e.id)).toEqual(['b', 'a']);
    expect(next.rows[0]!.used).toBe(3);
  });

  it('fait changer de rangée et met à jour l’occupation des deux', () => {
    const next = putElement(board, element('a', 'r1', 0, 2));
    expect(next.rows[0]!.elements.map((e) => e.id)).toEqual(['b']);
    expect(next.rows[0]!.used).toBe(1);
    expect(next.rows[1]!.elements.map((e) => e.id)).toEqual(['a', 'c']);
    expect(next.rows[1]!.used).toBe(3);
  });

  it('insère un élément absent', () => {
    const next = putElement(board, element('n', 'r1', 0));
    expect(next.rows[1]!.elements).toHaveLength(2);
  });

  it('ne modifie pas le tableau d’origine', () => {
    putElement(board, element('a', 'r1', 0, 2));
    expect(board.rows[0]!.elements).toHaveLength(2);
  });
});

describe('dropElement', () => {
  it('retire l’élément et libère ses modules', () => {
    const next = dropElement(board, 'a');
    expect(next.rows[0]!.elements.map((e) => e.id)).toEqual(['b']);
    expect(next.rows[0]!.used).toBe(1);
  });
});
