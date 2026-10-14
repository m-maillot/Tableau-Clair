import { describe, expect, it } from 'vitest';
import { modulesProblemMessage, rowsProblemMessage } from './messages';

describe('modulesProblemMessage', () => {
  it('cite le minimum, la rangée et l’élément (positions 1-indexées)', () => {
    const message = modulesProblemMessage({
      minimum: 18,
      rowIndex: 0,
      element: { id: 'x', label: 'Parafoudre', start: 17, end: 18 },
    });
    expect(message.title).toBe('Impossible de descendre sous 18 modules.');
    expect(message.body).toBe(
      'La rangée 1 en occupe 18 (« Parafoudre » en position 17–18). Déplacez ou retirez des éléments avant de réduire.',
    );
  });

  it('gère un élément d’un seul module et un élément sans libellé', () => {
    const single = modulesProblemMessage({
      minimum: 5,
      rowIndex: 2,
      element: { id: 'x', label: 'Four', start: 5, end: 5 },
    });
    expect(single.body).toContain('La rangée 3 en occupe 5 (« Four » en position 5)');

    const unnamed = modulesProblemMessage({
      minimum: 5,
      rowIndex: 0,
      element: { id: 'x', start: 4, end: 5 },
    });
    expect(unnamed.body).toContain('(position 4–5)');
  });

  it('reste correct sans élément identifié', () => {
    const message = modulesProblemMessage({ minimum: 3, rowIndex: 0, element: undefined });
    expect(message.body.startsWith('La rangée 1 en occupe 3.')).toBe(true);
  });
});

describe('rowsProblemMessage', () => {
  it('accorde rangée et élément', () => {
    expect(rowsProblemMessage({ minimum: 3, rowIndex: 2, elementCount: 1 })).toEqual({
      title: 'Impossible de descendre sous 3 rangées.',
      body: 'La rangée 3 contient 1 élément. Déplacez-les ou retirez-les avant de supprimer la rangée.',
    });
    expect(rowsProblemMessage({ minimum: 1, rowIndex: 0, elementCount: 4 }).title).toBe(
      'Impossible de descendre sous 1 rangée.',
    );
  });
});
