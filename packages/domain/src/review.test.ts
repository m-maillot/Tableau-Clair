import { describe, expect, it } from 'vitest';
import type { CircuitLink } from './circuits';
import { effectiveStatus, reliability, reviewItems } from './review';

const links: CircuitLink[] = [
  { fixtureId: 'f1', breakerId: 'b1', status: 'verified' },
  { fixtureId: 'f2', breakerId: 'b1', status: 'assumed' },
  { fixtureId: 'f3', breakerId: null, status: 'unknown' },
];
const fixtures = ['f1', 'f2', 'f3', 'f4'];

describe('effectiveStatus', () => {
  it('traite l’absence de liaison comme « inconnu »', () => {
    expect(effectiveStatus(links, 'f1')).toBe('verified');
    expect(effectiveStatus(links, 'f2')).toBe('assumed');
    expect(effectiveStatus(links, 'f3')).toBe('unknown');
    expect(effectiveStatus(links, 'f4')).toBe('unknown');
  });
});

describe('reliability', () => {
  it('répartit les équipements par statut', () => {
    expect(reliability(fixtures, links)).toEqual({ total: 4, verified: 1, assumed: 1, unknown: 2 });
    expect(reliability([], links)).toEqual({ total: 0, verified: 0, assumed: 0, unknown: 0 });
  });
});

describe('reviewItems', () => {
  it('liste ce qui reste à vérifier', () => {
    expect(reviewItems(fixtures, ['b1', 'b2'], links)).toEqual({
      assumed: ['f2'],
      unlinkedFixtures: ['f3', 'f4'],
      idleBreakers: ['b2'],
    });
  });

  it('est vide quand tout est vérifié', () => {
    const all: CircuitLink[] = [{ fixtureId: 'f1', breakerId: 'b1', status: 'verified' }];
    expect(reviewItems(['f1'], ['b1'], all)).toEqual({
      assumed: [],
      unlinkedFixtures: [],
      idleBreakers: [],
    });
  });
});
