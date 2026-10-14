import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

/** Couleurs déclarées dans tokens.css : `--color-ink: #0d1b3d;` → { ink: '#0d1b3d' }. */
const colors = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [
    name!,
    hex!,
  ]),
);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (a + 0.05) / (b + 0.05);
}

/** [texte, fond, usage] — toutes les paires de texte utilisées par les composants. */
const TEXT_PAIRS: [string, string, string][] = [
  ['ink', 'white', 'texte courant'],
  ['ink', 'surface', 'texte sur carte, champ, bouton secondaire'],
  ['ink', 'bg-soft', 'texte sur fond de page'],
  ['muted', 'white', 'texte secondaire sur blanc'],
  ['muted', 'surface', 'texte secondaire sur carte'],
  ['muted', 'bg-soft', 'texte secondaire sur fond de page'],
  ['white', 'blue', 'bouton principal, onglet de tableau, type sélectionné'],
  ['blue', 'white', 'onglet actif, lien'],
  ['ink', 'lime', 'bouton d’action rapide, élément sélectionné'],
  ['lime', 'ink', 'pastille de comptage'],
  ['white', 'ink', 'différentiel, carte d’alerte'],
  ['ink', 'module-other', 'contacteur, télérupteur, parafoudre'],
  ['status-verified-fg', 'status-verified-bg', 'statut vérifiée'],
  ['status-assumed-fg', 'status-assumed-bg', 'statut supposée'],
  ['status-unknown-fg', 'status-unknown-bg', 'statut inconnue'],
];

describe('tokens.css', () => {
  it('déclare tous les tokens de la spec', () => {
    for (const name of [
      'ink',
      'blue',
      'lime',
      'surface',
      'bg-soft',
      'muted',
      'module-other',
      'slot-border',
      'status-verified-bg',
      'status-verified-fg',
      'status-assumed-bg',
      'status-assumed-fg',
      'status-assumed-border',
      'status-unknown-bg',
      'status-unknown-fg',
    ]) {
      expect(colors[name], `--color-${name}`).toBeDefined();
    }
  });

  it('reprend les valeurs des maquettes', () => {
    expect(colors.ink).toBe('#0d1b3d');
    expect(colors.blue).toBe('#0f5bff');
    expect(colors.lime).toBe('#c5f26a');
    expect(colors.surface).toBe('#f1f4fa');
    expect(colors.muted).toBe('#56627f');
  });

  it.each(TEXT_PAIRS)('%s sur %s atteint le contraste AA (4,5:1) — %s', (fg, bg) => {
    const ratio = contrast(colors[fg] ?? '#000000', colors[bg] ?? '#ffffff');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('garantit un contour de module libre perceptible (3:1) sur blanc', () => {
    expect(contrast(colors['slot-border']!, colors.white!)).toBeGreaterThanOrEqual(3);
  });
});
