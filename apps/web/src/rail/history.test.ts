import type { Element } from '@tableau-clair/contracts';
import { describe, expect, it } from 'vitest';
import {
  afterRedo,
  afterUndo,
  EMPTY_HISTORY,
  MAX_HISTORY,
  nextRedo,
  nextUndo,
  record,
  remapElement,
  type Command,
} from './history';

const move = (id: string, from: number, to: number): Command => ({
  kind: 'move',
  elementId: id,
  before: { rowId: 'r', position: from },
  after: { rowId: 'r', position: to },
  label: `déplacé ${from}→${to}`,
});

describe('historique', () => {
  it('annuler ramène la dernière action, rétablir la rejoue', () => {
    let h = record(EMPTY_HISTORY, move('a', 0, 1));
    h = record(h, move('a', 1, 2));
    expect(nextUndo(h)).toMatchObject({ after: { position: 2 } });

    const undone = nextUndo(h)!;
    h = afterUndo(h, undone);
    expect(h.past).toHaveLength(1);
    expect(nextRedo(h)).toBe(undone);

    h = afterRedo(h, nextRedo(h)!);
    expect(h.past).toHaveLength(2);
    expect(h.future).toHaveLength(0);
  });

  it('une nouvelle action efface ce qui pouvait être rétabli', () => {
    let h = record(EMPTY_HISTORY, move('a', 0, 1));
    h = afterUndo(h, nextUndo(h)!);
    expect(nextRedo(h)).toBeDefined();

    h = record(h, move('b', 3, 4));
    expect(nextRedo(h)).toBeUndefined();
  });

  it('borne la longueur de l’historique', () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < MAX_HISTORY + 10; i++) h = record(h, move('a', i, i + 1));
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(nextUndo(h)).toMatchObject({ before: { position: MAX_HISTORY + 9 } });
  });

  it('est vide au départ', () => {
    expect(nextUndo(EMPTY_HISTORY)).toBeUndefined();
    expect(nextRedo(EMPTY_HISTORY)).toBeUndefined();
  });

  it('suit un élément restauré sous un nouvel identifiant', () => {
    const removed = { id: 'old', label: 'Four' } as Element;
    const restored = { id: 'new', label: 'Four' } as Element;
    let h = record(EMPTY_HISTORY, move('old', 0, 2));
    h = record(h, { kind: 'remove', element: removed, label: 'Supprimé' });
    h = record(h, { kind: 'add', element: removed, label: 'Ajout' });
    h = record(h, move('other', 5, 6));
    h = { ...h, future: [move('old', 2, 3)] };

    const remapped = remapElement(h, 'old', restored);
    expect((remapped.past[0] as { elementId: string }).elementId).toBe('new');
    expect((remapped.past[1] as { element: Element }).element.id).toBe('new');
    expect((remapped.past[2] as { element: Element }).element.id).toBe('new');
    expect((remapped.past[3] as { elementId: string }).elementId).toBe('other');
    expect((remapped.future[0] as { elementId: string }).elementId).toBe('new');
  });
});
