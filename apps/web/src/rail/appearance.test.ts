import { describe, expect, it } from 'vitest';
import { appearanceOf, KIND_LABEL, moduleRange } from './appearance';

const base = { ratingA: null, brand: null };

describe('appearanceOf', () => {
  it('différentiel : fond sombre, calibre avec son unité', () => {
    expect(appearanceOf({ ...base, kind: 'rcd', ratingA: 40 })).toEqual({
      tone: 'ink',
      top: '40 A',
      kindLabel: 'Différentiel',
    });
  });

  it('disjoncteur : bleu, calibre seul', () => {
    expect(appearanceOf({ ...base, kind: 'breaker', ratingA: 16 })).toMatchObject({
      tone: 'blue',
      top: '16',
    });
  });

  it('affiche un tiret quand le calibre est inconnu', () => {
    expect(appearanceOf({ ...base, kind: 'breaker' }).top).toBe('—');
    expect(appearanceOf({ ...base, kind: 'rcd' }).top).toBe('—');
  });

  it.each([
    ['hphc_contactor', 'HC'],
    ['impulse_relay', 'TL'],
    ['surge_protector', 'PF'],
    ['energy_meter', 'kWh'],
    ['relay', 'RL'],
    ['custom', '···'],
  ] as const)('%s : famille « autre », sigle %s', (kind, sigle) => {
    expect(appearanceOf({ ...base, kind })).toMatchObject({ tone: 'other', top: sigle });
  });

  it('module connecté : initiale de la marque, à défaut « C »', () => {
    expect(
      appearanceOf({ ratingA: null, brand: 'shelly', kind: 'connected_module' }),
    ).toMatchObject({
      tone: 'connected',
      top: 'S',
    });
    expect(appearanceOf({ ...base, kind: 'connected_module' }).top).toBe('C');
  });

  it('réserve : pointillés, aucun texte principal', () => {
    expect(appearanceOf({ ...base, kind: 'spare' })).toMatchObject({ tone: 'spare', top: '' });
  });

  it('nomme chaque type en français', () => {
    expect(Object.values(KIND_LABEL).every((label) => label.length > 0)).toBe(true);
    expect(KIND_LABEL.impulse_relay).toBe('Télérupteur');
  });
});

describe('moduleRange', () => {
  it('compte les modules à partir de 1', () => {
    expect(moduleRange(3, 1)).toBe('module 4');
    expect(moduleRange(16, 2)).toBe('modules 17–18');
  });
});
