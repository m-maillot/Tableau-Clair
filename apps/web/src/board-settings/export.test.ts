import { describe, expect, it } from 'vitest';
import { exportBoardJson, exportFileName } from './export';

describe('exportFileName', () => {
  it('produit un nom de fichier simple, daté', () => {
    expect(exportFileName('Tableau principal — Étage', new Date('2026-10-14T10:00:00Z'))).toBe(
      'tableau-clair-tableau-principal-etage-2026-10-14.json',
    );
  });

  it('retombe sur un nom par défaut', () => {
    expect(exportFileName('???', new Date('2026-10-14T10:00:00Z'))).toBe(
      'tableau-clair-tableau-2026-10-14.json',
    );
  });
});

describe('exportBoardJson', () => {
  it('contient la date et la composition complète', () => {
    const board = { id: 'b', name: 'Principal', rows: [] } as never;
    const parsed = JSON.parse(exportBoardJson(board, new Date('2026-10-14T10:00:00Z')));
    expect(parsed.exportedAt).toBe('2026-10-14T10:00:00.000Z');
    expect(parsed.board.name).toBe('Principal');
  });
});
