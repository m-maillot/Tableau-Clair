import { describe, expect, it } from 'vitest';
import { ELEMENT_KINDS } from './enums';
import { DEFAULT_WIDTH, selectableKinds } from './catalog';

describe('DEFAULT_WIDTH', () => {
  it('couvre tous les types, avec au moins un module', () => {
    for (const kind of ELEMENT_KINDS) expect(DEFAULT_WIDTH[kind]).toBeGreaterThanOrEqual(1);
  });

  it('reprend les largeurs de la spec', () => {
    expect(DEFAULT_WIDTH.rcd).toBe(2);
    expect(DEFAULT_WIDTH.breaker).toBe(1);
    expect(DEFAULT_WIDTH.surge_protector).toBe(2);
  });
});

describe('selectableKinds', () => {
  const kinds = (
    position: number,
    capacity = 4,
    elements: { id: string; position: number; width: number }[] = [],
  ) =>
    Object.fromEntries(
      selectableKinds({ capacity, elements }, position).map((k) => [k.kind, k.enabled]),
    );

  it("grise les types de 2 modules quand il n'en reste qu'un", () => {
    const enabled = kinds(3);
    expect(enabled.breaker).toBe(true);
    expect(enabled.rcd).toBe(false);
    expect(enabled.surge_protector).toBe(false);
    expect(enabled.energy_meter).toBe(false);
    expect(enabled.custom).toBe(true);
  });

  it('active tout quand la place suffit', () => {
    expect(Object.values(kinds(0)).every(Boolean)).toBe(true);
  });

  it('grise tout sur un module occupé', () => {
    const enabled = kinds(0, 4, [{ id: 'a', position: 0, width: 1 }]);
    expect(Object.values(enabled).every((v) => v === false)).toBe(true);
  });
});
