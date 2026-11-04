import { describe, expect, it } from 'vitest';
import {
  defaultLabel,
  normalizeProposal,
  type BoardRowState,
  type ProposedElement,
  type ProposedRow,
} from './proposal';

const element = (overrides: Partial<ProposedElement> = {}): ProposedElement => ({
  position: 0,
  width: 1,
  kind: 'breaker',
  confidence: 'high',
  ...overrides,
});

const board = (elements: BoardRowState['elements'] = []): BoardRowState[] => [
  { index: 0, capacity: 12, elements },
  { index: 1, capacity: 12, elements: [] },
];

const rows = (...elements: ProposedElement[]): ProposedRow[] => [{ index: 0, elements }];

describe('defaultLabel', () => {
  it('compose le type, le calibre et la sensibilité', () => {
    expect(defaultLabel({ kind: 'breaker', ratingA: 16 })).toBe('Disjoncteur 16 A');
    expect(defaultLabel({ kind: 'rcd', ratingA: 40, sensitivityMa: 30 })).toBe(
      'Différentiel 40 A 30 mA',
    );
    expect(defaultLabel({ kind: 'surge_protector' })).toBe('Parafoudre');
  });
});

describe('normalizeProposal', () => {
  it('garde un libellé lu et génère un libellé par défaut sinon', () => {
    const [row] = normalizeProposal(
      rows(
        element({ label: '  Prises cuisine ', position: 0 }),
        element({ label: '   ', ratingA: 20, position: 1 }),
        element({ position: 2 }),
      ),
      board(),
    );
    expect(row!.elements.map((e) => e.label)).toEqual([
      'Prises cuisine',
      'Disjoncteur 20 A',
      'Disjoncteur',
    ]);
  });

  it('tronque les libellés trop longs', () => {
    const [row] = normalizeProposal(rows(element({ label: 'x'.repeat(500) })), board(), {
      maxLabelLength: 10,
    });
    expect(row!.elements[0]!.label).toHaveLength(10);
  });

  it('arrondit positions et largeurs et ordonne les appareils', () => {
    const [row] = normalizeProposal(
      rows(element({ position: 5.4, width: 0 }), element({ position: 1.6, width: 2.2 })),
      board(),
    );
    expect(row!.elements.map((e) => [e.position, e.width, e.conflict])).toEqual([
      [2, 2, null],
      [5, 1, null],
    ]);
  });

  it('ignore les rangées qui n’existent pas dans le tableau', () => {
    const result = normalizeProposal(
      [{ index: 7, elements: [element()] }, ...rows(element())],
      board(),
    );
    expect(result.map((r) => r.index)).toEqual([0]);
  });

  it('signale le dépassement de la rangée', () => {
    const [row] = normalizeProposal(rows(element({ position: 11, width: 2 })), board());
    expect(row!.elements[0]!.conflict).toBe('out_of_bounds');
  });

  it('signale le chevauchement avec un appareil existant', () => {
    const [row] = normalizeProposal(
      rows(element({ position: 3 }), element({ position: 4 })),
      board([{ id: 'existing', position: 3, width: 1 }]),
    );
    expect(row!.elements.map((e) => e.conflict)).toEqual(['overlap', null]);
  });

  it('signale le chevauchement entre propositions, la première gagne', () => {
    const [row] = normalizeProposal(
      rows(element({ position: 0, width: 2, kind: 'rcd' }), element({ position: 1 })),
      board(),
    );
    expect(row!.elements.map((e) => e.conflict)).toEqual([null, 'overlap']);
  });

  it('un appareil en conflit ne bloque pas les suivants', () => {
    const [row] = normalizeProposal(
      rows(element({ position: 20 }), element({ position: 1 })),
      board(),
    );
    expect(row!.elements.map((e) => e.conflict)).toEqual([null, 'out_of_bounds']);
  });

  it('plafonne le nombre d’appareils', () => {
    const many = Array.from({ length: 10 }, (_, i) => element({ position: i }));
    const [row] = normalizeProposal(rows(...many), board(), {
      maxLabelLength: 120,
      maxElements: 4,
    });
    expect(row!.elements).toHaveLength(4);
  });
});
