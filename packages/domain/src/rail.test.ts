import { describe, expect, it } from 'vitest';
import { fitsInRow, overlaps } from './rail';

describe('fitsInRow', () => {
  it('accepte un élément dans la rangée', () => {
    expect(fitsInRow({ position: 22, width: 2 }, 24)).toBe(true);
  });
  it('refuse un dépassement', () => {
    expect(fitsInRow({ position: 23, width: 2 }, 24)).toBe(false);
  });
});

describe('overlaps', () => {
  it('détecte un chevauchement', () => {
    expect(overlaps({ position: 0, width: 2 }, { position: 1, width: 1 })).toBe(true);
  });
  it('accepte deux éléments contigus', () => {
    expect(overlaps({ position: 0, width: 2 }, { position: 2, width: 1 })).toBe(false);
  });
});
