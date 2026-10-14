import { describe, expect, it } from 'vitest';
import { greetingName, lastModifiedLabel, plural, relativeDay } from './format';

// Mercredi 14 octobre 2026, 15 h.
const NOW = new Date(2026, 9, 14, 15, 0);

describe('relativeDay', () => {
  it('compare les jours calendaires, pas des tranches de 24 h', () => {
    expect(relativeDay(new Date(2026, 9, 14, 0, 5), NOW)).toBe("aujourd'hui");
    expect(relativeDay(new Date(2026, 9, 13, 23, 55), NOW)).toBe('hier');
    expect(relativeDay(new Date(2026, 9, 12, 18, 42), NOW)).toBe('le 12 oct.');
  });

  it('traite une date légèrement dans le futur comme aujourd’hui', () => {
    expect(relativeDay(new Date(2026, 9, 14, 15, 1), NOW)).toBe("aujourd'hui");
  });
});

describe('lastModifiedLabel', () => {
  it('nomme l’auteur quand il est connu', () => {
    const at = new Date(2026, 9, 13, 18, 42).toISOString();
    expect(lastModifiedLabel({ at, by: 'Martial' }, NOW)).toBe('Modifié hier par Martial');
    expect(lastModifiedLabel({ at, by: null }, NOW)).toBe('Modifié hier');
  });

  it('affiche le prénom quand le serveur ne connaît que l’adresse', () => {
    const at = new Date(2026, 9, 13, 18, 42).toISOString();
    expect(lastModifiedLabel({ at, by: 'martial@racomach.fr' }, NOW)).toBe(
      'Modifié hier par Martial',
    );
  });

  it('ne dit rien sans modification', () => {
    expect(lastModifiedLabel(null, NOW)).toBeNull();
  });
});

describe('greetingName', () => {
  it('préfère le nom enregistré', () => {
    expect(greetingName({ displayName: 'martial maillot', email: 'x@y.fr' })).toBe('Martial');
  });

  it('retombe sur la partie locale de l’adresse', () => {
    expect(greetingName({ displayName: null, email: 'martial.maillot@racomach.fr' })).toBe(
      'Martial',
    );
    expect(greetingName({ displayName: '  ', email: 'camille@exemple.fr' })).toBe('Camille');
  });
});

describe('plural', () => {
  it('accorde selon le nombre', () => {
    expect(plural(0, 'tableau', 'tableaux')).toBe('tableau');
    expect(plural(1, 'tableau', 'tableaux')).toBe('tableau');
    expect(plural(2, 'tableau', 'tableaux')).toBe('tableaux');
  });
});
