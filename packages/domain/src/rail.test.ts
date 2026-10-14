import { describe, expect, it } from 'vitest';
import {
  allowedWidthsAt,
  analyzeBoardResize,
  fitsInRow,
  freeSlots,
  maxWidthAt,
  minRowCapacity,
  moveElement,
  moveElementBy,
  moveToRow,
  overlaps,
  placeElement,
  removeElement,
  resizeElement,
  rowOccupancy,
  setRowCapacity,
  validateSpan,
  type Placed,
  type RowState,
} from './rail';

const el = (id: string, position: number, width = 1): Placed => ({ id, position, width });
const row = (capacity: number, ...elements: Placed[]): RowState => ({ capacity, elements });
const positions = (r: RowState) => r.elements.map((e) => `${e.id}@${e.position}+${e.width}`);

function expectOk<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.value as T;
}

describe('fitsInRow / overlaps', () => {
  it('fitsInRow borne la rangée', () => {
    expect(fitsInRow({ position: 22, width: 2 }, 24)).toBe(true);
    expect(fitsInRow({ position: 23, width: 2 }, 24)).toBe(false);
    expect(fitsInRow({ position: -1, width: 1 }, 24)).toBe(false);
    expect(fitsInRow({ position: 0, width: 0 }, 24)).toBe(false);
  });

  it('overlaps détecte les chevauchements, pas la contiguïté', () => {
    expect(overlaps({ position: 0, width: 2 }, { position: 1, width: 1 })).toBe(true);
    expect(overlaps({ position: 1, width: 1 }, { position: 0, width: 2 })).toBe(true);
    expect(overlaps({ position: 0, width: 2 }, { position: 2, width: 1 })).toBe(false);
    expect(overlaps({ position: 0, width: 4 }, { position: 1, width: 1 })).toBe(true);
  });
});

describe('validateSpan', () => {
  const r = row(24, el('a', 4, 2));

  it('accepte un intervalle libre', () => {
    expect(validateSpan(r, { position: 0, width: 4 })).toBeUndefined();
    expect(validateSpan(r, { position: 6, width: 18 })).toBeUndefined();
  });

  it('rejette largeur et position invalides, y compris non entières', () => {
    expect(validateSpan(r, { position: 0, width: 0 })).toEqual({ code: 'invalid_width' });
    expect(validateSpan(r, { position: 0, width: 1.5 })).toEqual({ code: 'invalid_width' });
    expect(validateSpan(r, { position: -1, width: 1 })).toEqual({ code: 'invalid_position' });
    expect(validateSpan(r, { position: 0.5, width: 1 })).toEqual({ code: 'invalid_position' });
  });

  it('rejette un dépassement et indique la capacité', () => {
    expect(validateSpan(r, { position: 23, width: 2 })).toEqual({
      code: 'out_of_bounds',
      capacity: 24,
    });
  });

  it('rejette un chevauchement et nomme le conflit', () => {
    expect(validateSpan(r, { position: 5, width: 1 })).toEqual({ code: 'overlap', with: 'a' });
  });

  it("ignore l'élément indiqué", () => {
    expect(validateSpan(r, { position: 4, width: 3 }, 'a')).toBeUndefined();
  });
});

describe('placeElement', () => {
  it('pose et trie par position', () => {
    let r = row(24);
    r = expectOk(placeElement(r, el('b', 5)));
    r = expectOk(placeElement(r, el('a', 0, 2)));
    expect(positions(r)).toEqual(['a@0+2', 'b@5+1']);
  });

  it('refuse un identifiant déjà présent, un dépassement et un chevauchement', () => {
    const r = row(4, el('a', 0, 2));
    expect(placeElement(r, el('a', 2))).toEqual({
      ok: false,
      error: { code: 'duplicate_id', id: 'a' },
    });
    expect(placeElement(r, el('b', 3, 2)).ok).toBe(false);
    expect(placeElement(r, el('b', 1)).ok).toBe(false);
  });

  it("ne modifie pas la rangée d'origine", () => {
    const r = row(24, el('a', 0));
    placeElement(r, el('b', 1));
    expect(r.elements).toHaveLength(1);
  });

  it('conserve les champs supplémentaires des éléments', () => {
    const r: RowState<Placed & { label: string }> = { capacity: 4, elements: [] };
    const next = expectOk(placeElement(r, { id: 'a', position: 0, width: 1, label: 'Cumulus' }));
    expect(next.elements[0]?.label).toBe('Cumulus');
  });
});

describe('moveElement / moveElementBy', () => {
  const r = row(10, el('a', 0, 2), el('b', 4), el('c', 8, 2));

  it('déplace vers un emplacement libre', () => {
    expect(positions(expectOk(moveElement(r, 'a', 2)))).toEqual(['a@2+2', 'b@4+1', 'c@8+2']);
  });

  it('permet de rester sur place ou de chevaucher sa propre position', () => {
    expect(positions(expectOk(moveElement(r, 'a', 1)))).toEqual(['a@1+2', 'b@4+1', 'c@8+2']);
  });

  it('refuse sur un voisin et hors rangée', () => {
    expect(moveElement(r, 'a', 3)).toEqual({ ok: false, error: { code: 'overlap', with: 'b' } });
    expect(moveElement(r, 'c', 9).ok).toBe(false);
  });

  it('refuse un élément inconnu', () => {
    expect(moveElement(r, 'zz', 1)).toEqual({ ok: false, error: { code: 'not_found', id: 'zz' } });
  });

  it('moveElementBy gère ← et →, bloqué par un voisin ou le bord', () => {
    expect(positions(expectOk(moveElementBy(r, 'b', 1)))).toContain('b@5+1');
    expect(positions(expectOk(moveElementBy(r, 'b', -1)))).toContain('b@3+1');
    expect(moveElementBy(r, 'a', -1).ok).toBe(false);
    expect(moveElementBy(r, 'a', 2).ok).toBe(true);
    expect(moveElementBy(r, 'a', 3).ok).toBe(false);
  });
});

describe('resizeElement', () => {
  const r = row(6, el('a', 0), el('b', 2));

  it('agrandit dans la limite du voisin', () => {
    expect(positions(expectOk(resizeElement(r, 'a', 2)))).toEqual(['a@0+2', 'b@2+1']);
    expect(resizeElement(r, 'a', 3)).toEqual({ ok: false, error: { code: 'overlap', with: 'b' } });
  });

  it('rétrécit et refuse une largeur invalide ou un dépassement', () => {
    expect(positions(expectOk(resizeElement(row(6, el('a', 0, 3)), 'a', 1)))).toEqual(['a@0+1']);
    expect(resizeElement(r, 'a', 0)).toEqual({ ok: false, error: { code: 'invalid_width' } });
    expect(resizeElement(r, 'b', 5)).toEqual({
      ok: false,
      error: { code: 'out_of_bounds', capacity: 6 },
    });
  });
});

describe('removeElement', () => {
  it('libère les modules', () => {
    const r = expectOk(removeElement(row(4, el('a', 0, 2), el('b', 2)), 'a'));
    expect(positions(r)).toEqual(['b@2+1']);
    expect(freeSlots(r)).toEqual([
      { position: 0, width: 2 },
      { position: 3, width: 1 },
    ]);
  });

  it('refuse un élément inconnu', () => {
    expect(removeElement(row(4), 'x')).toEqual({
      ok: false,
      error: { code: 'not_found', id: 'x' },
    });
  });
});

describe('moveToRow', () => {
  it('déplace vers une autre rangée sans toucher aux deux états si refusé', () => {
    const source = row(4, el('a', 0, 2));
    const target = row(4, el('b', 1));
    const refused = moveToRow(source, target, 'a', 0);
    expect(refused).toEqual({ ok: false, error: { code: 'overlap', with: 'b' } });

    const moved = expectOk(moveToRow(source, target, 'a', 2));
    expect(positions(moved.source)).toEqual([]);
    expect(positions(moved.target)).toEqual(['b@1+1', 'a@2+2']);
    expect(source.elements).toHaveLength(1);
  });

  it('refuse un élément inconnu et une rangée plus courte', () => {
    expect(moveToRow(row(4), row(4), 'x', 0).ok).toBe(false);
    expect(moveToRow(row(4, el('a', 0, 3)), row(2), 'a', 0)).toEqual({
      ok: false,
      error: { code: 'out_of_bounds', capacity: 2 },
    });
  });
});

describe('occupation et modules libres', () => {
  const r = row(10, el('a', 0, 2), el('b', 4), el('c', 8, 2));

  it('rowOccupancy compte les modules occupés', () => {
    expect(rowOccupancy(r)).toEqual({ capacity: 10, used: 5, free: 5 });
    expect(rowOccupancy(row(24))).toEqual({ capacity: 24, used: 0, free: 24 });
  });

  it('freeSlots liste les plages libres', () => {
    expect(freeSlots(r)).toEqual([
      { position: 2, width: 2 },
      { position: 5, width: 3 },
    ]);
    expect(freeSlots(row(3))).toEqual([{ position: 0, width: 3 }]);
    expect(freeSlots(row(2, el('a', 0, 2)))).toEqual([]);
  });

  it('maxWidthAt donne la place disponible depuis un module', () => {
    expect(maxWidthAt(r, 2)).toBe(2);
    expect(maxWidthAt(r, 3)).toBe(1);
    expect(maxWidthAt(r, 5)).toBe(3);
    expect(maxWidthAt(r, 0)).toBe(0); // occupé
    expect(maxWidthAt(r, 1)).toBe(0); // occupé (milieu d'un élément)
    expect(maxWidthAt(r, 10)).toBe(0); // hors rangée
    expect(maxWidthAt(r, -1)).toBe(0);
    expect(maxWidthAt(row(24), 0)).toBe(24);
  });

  it('maxWidthAt peut ignorer un élément (redimensionnement)', () => {
    expect(maxWidthAt(r, 4, 'b')).toBe(4);
  });

  it('allowedWidthsAt filtre les largeurs candidates', () => {
    expect(allowedWidthsAt(r, 2, [1, 2, 3, 4])).toEqual([1, 2]);
    expect(allowedWidthsAt(r, 0, [1, 2])).toEqual([]);
    expect(allowedWidthsAt(r, 5, [0, 1, 3, 4])).toEqual([1, 3]);
  });
});

describe('géométrie de la rangée', () => {
  it('minRowCapacity va jusqu au bout du dernier élément', () => {
    expect(minRowCapacity(row(24, el('a', 0), el('b', 10, 2)))).toBe(12);
    expect(minRowCapacity(row(24))).toBe(1);
  });

  it('setRowCapacity refuse de réduire sous les éléments', () => {
    const r = row(24, el('a', 0), el('b', 10, 2));
    expect(setRowCapacity(r, 11)).toEqual({
      ok: false,
      error: { code: 'out_of_bounds', capacity: 11 },
    });
    expect(expectOk(setRowCapacity(r, 12)).capacity).toBe(12);
    expect(expectOk(setRowCapacity(r, 36)).capacity).toBe(36);
    expect(setRowCapacity(r, 0).ok).toBe(false);
    expect(setRowCapacity(r, 12.5).ok).toBe(false);
  });
});

describe('invariants (aléatoire)', () => {
  // Générateur déterministe : le test reste reproductible.
  function prng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it("aucune suite d'opérations n'aboutit à un chevauchement ni à un dépassement", () => {
    for (const seed of [1, 7, 42, 2024]) {
      const rand = prng(seed);
      const int = (max: number) => Math.floor(rand() * max);
      let r = row(24);
      let counter = 0;

      for (let step = 0; step < 400; step++) {
        const ids = r.elements.map((e) => e.id);
        const pick = ids[int(ids.length)];
        const op = int(5);
        const next =
          op === 0 || !pick
            ? placeElement(r, el(`e${counter++}`, int(26) - 1, int(4)))
            : op === 1
              ? moveElement(r, pick, int(26) - 1)
              : op === 2
                ? resizeElement(r, pick, int(5))
                : op === 3
                  ? moveElementBy(r, pick, int(5) - 2)
                  : removeElement(r, pick);
        if (next.ok) r = next.value;

        const sortedEls = [...r.elements].sort((a, b) => a.position - b.position);
        sortedEls.forEach((e, i) => {
          expect(fitsInRow(e, r.capacity)).toBe(true);
          const following = sortedEls[i + 1];
          if (following) expect(overlaps(e, following)).toBe(false);
        });
        expect(rowOccupancy(r).free).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('analyzeBoardResize', () => {
  const rails = [
    {
      index: 0,
      elements: [
        { id: 'a', position: 0, width: 2, label: 'Diff' },
        { id: 'b', position: 16, width: 2, label: 'Parafoudre' },
      ],
    },
    { index: 1, elements: [{ id: 'c', position: 0, width: 4 }] },
    { index: 2, elements: [] },
  ];

  it('ne signale rien quand la géométrie visée contient tout', () => {
    expect(analyzeBoardResize(rails, { rowCount: 3, modulesPerRow: 24 })).toEqual({
      rows: null,
      modules: null,
      overflowingElementIds: [],
    });
  });

  it('cite la rangée, le minimum et l’élément qui va jusqu’au bout', () => {
    const result = analyzeBoardResize(rails, { rowCount: 3, modulesPerRow: 16 });
    expect(result.modules).toEqual({
      minimum: 18,
      rowIndex: 0,
      element: { id: 'b', label: 'Parafoudre', start: 17, end: 18 },
    });
    expect(result.overflowingElementIds).toEqual(['b']);
  });

  it('accepte exactement le minimum', () => {
    expect(analyzeBoardResize(rails, { rowCount: 3, modulesPerRow: 18 }).modules).toBeNull();
  });

  it('refuse de retirer une rangée non vide, et laisse retirer une rangée vide', () => {
    expect(analyzeBoardResize(rails, { rowCount: 2, modulesPerRow: 24 }).rows).toBeNull();
    expect(analyzeBoardResize(rails, { rowCount: 1, modulesPerRow: 24 }).rows).toEqual({
      minimum: 2,
      rowIndex: 1,
      elementCount: 1,
    });
  });

  it('ignore les rangées retirées vides pour le minimum de modules', () => {
    const tall = [
      { index: 0, elements: [{ id: 'a', position: 0, width: 4 }] },
      { index: 1, elements: [] },
    ];
    expect(analyzeBoardResize(tall, { rowCount: 1, modulesPerRow: 4 }).modules).toBeNull();
  });

  it('gère un tableau sans élément', () => {
    expect(
      analyzeBoardResize([{ index: 0, elements: [] }], { rowCount: 1, modulesPerRow: 1 }),
    ).toEqual({
      rows: null,
      modules: null,
      overflowingElementIds: [],
    });
  });

  it('omet le libellé quand l’élément n’en a pas', () => {
    const result = analyzeBoardResize(
      [{ index: 0, elements: [{ id: 'x', position: 3, width: 1 }] }],
      { rowCount: 1, modulesPerRow: 2 },
    );
    expect(result.modules?.element).toEqual({ id: 'x', start: 4, end: 4 });
  });
});
