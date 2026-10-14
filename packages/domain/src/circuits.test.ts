import { describe, expect, it } from 'vitest';
import {
  breakerOfFixture,
  canPowerCircuits,
  confirmLink,
  fixturesOfBreaker,
  linkFixture,
  removeBreaker,
  setLinkStatus,
  unlinkFixture,
  type BreakerRef,
  type CircuitLink,
} from './circuits';

const elements: BreakerRef[] = [
  { id: 'b1', kind: 'breaker' },
  { id: 'b2', kind: 'breaker' },
  { id: 'd1', kind: 'rcd' },
];

describe('linkFixture', () => {
  it('crée une liaison', () => {
    const result = linkFixture(
      [],
      { fixtureId: 'f1', breakerId: 'b1', status: 'assumed' },
      elements,
    );
    expect(result).toEqual({
      ok: true,
      value: [{ fixtureId: 'f1', breakerId: 'b1', status: 'assumed' }],
    });
  });

  it('remplace la liaison existante : un équipement, un seul disjoncteur', () => {
    const links: CircuitLink[] = [{ fixtureId: 'f1', breakerId: 'b1', status: 'verified' }];
    const result = linkFixture(
      links,
      { fixtureId: 'f1', breakerId: 'b2', status: 'assumed' },
      elements,
    );
    expect(result).toEqual({
      ok: true,
      value: [{ fixtureId: 'f1', breakerId: 'b2', status: 'assumed' }],
    });
  });

  it('refuse un disjoncteur inconnu ou un autre type', () => {
    expect(
      linkFixture([], { fixtureId: 'f', breakerId: 'zz', status: 'assumed' }, elements),
    ).toEqual({
      ok: false,
      error: { code: 'breaker_not_found', breakerId: 'zz' },
    });
    expect(
      linkFixture([], { fixtureId: 'f', breakerId: 'd1', status: 'assumed' }, elements),
    ).toEqual({
      ok: false,
      error: { code: 'not_a_breaker', breakerId: 'd1' },
    });
  });
});

describe('canPowerCircuits', () => {
  it('ne retient que les disjoncteurs divisionnaires', () => {
    expect(canPowerCircuits('breaker')).toBe(true);
    expect(canPowerCircuits('rcd')).toBe(false);
    expect(canPowerCircuits('spare')).toBe(false);
  });
});

describe('unlinkFixture / removeBreaker', () => {
  const links: CircuitLink[] = [
    { fixtureId: 'f1', breakerId: 'b1', status: 'verified' },
    { fixtureId: 'f2', breakerId: 'b1', status: 'assumed' },
    { fixtureId: 'f3', breakerId: 'b2', status: 'verified' },
  ];

  it('unlinkFixture retire la liaison', () => {
    expect(unlinkFixture(links, 'f1').map((l) => l.fixtureId)).toEqual(['f2', 'f3']);
  });

  it('removeBreaker passe les équipements du disjoncteur à « inconnu » sans les supprimer', () => {
    const next = removeBreaker(links, 'b1');
    expect(next).toEqual([
      { fixtureId: 'f1', breakerId: null, status: 'unknown' },
      { fixtureId: 'f2', breakerId: null, status: 'unknown' },
      { fixtureId: 'f3', breakerId: 'b2', status: 'verified' },
    ]);
    expect(links[0]?.status).toBe('verified'); // entrée non modifiée
  });
});

describe('setLinkStatus / confirmLink', () => {
  const links: CircuitLink[] = [
    { fixtureId: 'f1', breakerId: 'b1', status: 'assumed' },
    { fixtureId: 'f2', breakerId: null, status: 'unknown' },
  ];

  it('confirme une liaison supposée', () => {
    expect(confirmLink(links, 'f1')).toMatchObject({
      ok: true,
      value: [{ fixtureId: 'f1', status: 'verified' }, { fixtureId: 'f2' }],
    });
  });

  it('refuse de vérifier ou supposer sans disjoncteur', () => {
    expect(confirmLink(links, 'f2')).toEqual({
      ok: false,
      error: { code: 'status_requires_breaker', fixtureId: 'f2' },
    });
    expect(setLinkStatus(links, 'f2', 'assumed').ok).toBe(false);
    expect(setLinkStatus(links, 'f2', 'unknown').ok).toBe(true);
  });

  it('refuse un équipement non relié', () => {
    expect(confirmLink(links, 'f9')).toEqual({
      ok: false,
      error: { code: 'not_linked', fixtureId: 'f9' },
    });
  });
});

describe('recherche dans les deux sens', () => {
  const links: CircuitLink[] = [
    { fixtureId: 'f1', breakerId: 'b1', status: 'verified' },
    { fixtureId: 'f2', breakerId: 'b1', status: 'assumed' },
    { fixtureId: 'f3', breakerId: null, status: 'unknown' },
  ];

  it('fixturesOfBreaker liste les équipements alimentés', () => {
    expect(fixturesOfBreaker(links, 'b1').map((l) => l.fixtureId)).toEqual(['f1', 'f2']);
    expect(fixturesOfBreaker(links, 'b2')).toEqual([]);
  });

  it('breakerOfFixture renvoie le disjoncteur à couper, ou rien', () => {
    expect(breakerOfFixture(links, 'f1')?.breakerId).toBe('b1');
    expect(breakerOfFixture(links, 'f3')).toBeUndefined();
    expect(breakerOfFixture(links, 'f9')).toBeUndefined();
  });
});
