import { describe, expect, it } from 'vitest';
import {
  clampPoint,
  containsPoint,
  MIN_ROOM_SIZE,
  moveRect,
  PLAN_WORLD,
  rectFromCorners,
  rectWithin,
  resizeRect,
  roomAt,
  shiftPoint,
} from './plan';

const canvas = { w: 1000, h: 700 };
const room = { x: 100, y: 100, w: 200, h: 150 };

describe('containsPoint / rectWithin / clampPoint', () => {
  it('contient les points du bord', () => {
    expect(containsPoint(room, { x: 100, y: 100 })).toBe(true);
    expect(containsPoint(room, { x: 300, y: 250 })).toBe(true);
    expect(containsPoint(room, { x: 301, y: 250 })).toBe(false);
  });

  it('rectWithin vérifie les quatre bords du canevas', () => {
    expect(rectWithin(canvas, room)).toBe(true);
    expect(rectWithin(canvas, { ...room, x: -1 })).toBe(false);
    expect(rectWithin(canvas, { ...room, x: 900 })).toBe(false);
    expect(rectWithin(canvas, { ...room, y: 600 })).toBe(false);
  });

  it('clampPoint ramène un point à l’intérieur', () => {
    expect(clampPoint(room, { x: 0, y: 999 })).toEqual({ x: 100, y: 250 });
    expect(clampPoint(room, { x: 150, y: 120 })).toEqual({ x: 150, y: 120 });
  });
});

describe('rectFromCorners', () => {
  it('normalise quel que soit le sens du tracé', () => {
    const expected = { x: 10, y: 20, w: 40, h: 30 };
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 50, y: 50 })).toEqual(expected);
    expect(rectFromCorners({ x: 50, y: 50 }, { x: 10, y: 20 })).toEqual(expected);
    expect(rectFromCorners({ x: 50, y: 20 }, { x: 10, y: 50 })).toEqual(expected);
  });
});

describe('moveRect', () => {
  it('déplace', () => {
    expect(moveRect(room, 50, -20, canvas)).toEqual({ x: 150, y: 80, w: 200, h: 150 });
  });

  it('reste dans le canevas', () => {
    expect(moveRect(room, -500, -500, canvas)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(room, 5000, 5000, canvas)).toMatchObject({ x: 800, y: 550 });
  });
});

describe('resizeRect', () => {
  it('agrandit par le coin bas-droit en gardant le coin opposé', () => {
    expect(resizeRect(room, 'se', 50, 30, canvas)).toEqual({ x: 100, y: 100, w: 250, h: 180 });
  });

  it('agrandit par le coin haut-gauche en gardant le coin opposé', () => {
    expect(resizeRect(room, 'nw', -40, -20, canvas)).toEqual({ x: 60, y: 80, w: 240, h: 170 });
  });

  it('traite les deux autres coins', () => {
    expect(resizeRect(room, 'ne', 30, -10, canvas)).toEqual({ x: 100, y: 90, w: 230, h: 160 });
    expect(resizeRect(room, 'sw', -30, 10, canvas)).toEqual({ x: 70, y: 100, w: 230, h: 160 });
  });

  it('respecte la taille minimale sans déplacer le coin fixe', () => {
    const shrunk = resizeRect(room, 'se', -500, -500, canvas);
    expect(shrunk).toEqual({ x: 100, y: 100, w: MIN_ROOM_SIZE, h: MIN_ROOM_SIZE });
    const fromTopLeft = resizeRect(room, 'nw', 500, 500, canvas);
    expect(fromTopLeft).toEqual({
      x: 300 - MIN_ROOM_SIZE,
      y: 250 - MIN_ROOM_SIZE,
      w: MIN_ROOM_SIZE,
      h: MIN_ROOM_SIZE,
    });
  });

  it('reste dans le canevas', () => {
    const big = resizeRect(room, 'se', 5000, 5000, canvas);
    expect(rectWithin(canvas, big)).toBe(true);
    expect(big).toEqual({ x: 100, y: 100, w: 900, h: 600 });
    expect(resizeRect(room, 'nw', -5000, -5000, canvas)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('roomAt', () => {
  const rooms = [
    { id: 'house', x: 0, y: 0, w: 500, h: 500 },
    { id: 'kitchen', x: 100, y: 100, w: 100, h: 100 },
  ];

  it('choisit la plus petite pièce qui contient le point', () => {
    expect(roomAt(rooms, { x: 150, y: 150 })?.id).toBe('kitchen');
    expect(roomAt(rooms, { x: 400, y: 400 })?.id).toBe('house');
  });

  it('ne trouve rien hors des pièces', () => {
    expect(roomAt(rooms, { x: 900, y: 900 })).toBeUndefined();
  });
});

describe('shiftPoint', () => {
  it('translate', () => {
    expect(shiftPoint({ x: 10, y: 20 }, 5, -5)).toEqual({ x: 15, y: 15 });
  });
});

describe('plan illimité', () => {
  it('déplace sans limite pratique, y compris vers les coordonnées négatives', () => {
    const room = { x: 0, y: 0, w: 100, h: 100 };
    expect(moveRect(room, -5000, -3000)).toMatchObject({ x: -5000, y: -3000 });
    // Au-delà du monde, la pièce est ramenée à ses limites.
    expect(moveRect(room, 1e9, 0).x).toBe(PLAN_WORLD - 100);
  });

  it('redimensionne par une poignée au-delà de l’ancien canevas', () => {
    const room = { x: 100, y: 100, w: 100, h: 100 };
    expect(resizeRect(room, 'se', 5000, 5000)).toEqual({ x: 100, y: 100, w: 5100, h: 5100 });
    expect(resizeRect(room, 'nw', -2000, -2000)).toEqual({ x: -1900, y: -1900, w: 2100, h: 2100 });
  });

  it('garde le comportement borné quand on donne un canevas', () => {
    const room = { x: 0, y: 0, w: 100, h: 100 };
    expect(moveRect(room, 5000, 0, { w: 1000, h: 700 }).x).toBe(900);
    expect(rectWithin({ x: -10, y: -10, w: 100, h: 100 }, { x: -5, y: -5, w: 20, h: 20 })).toBe(
      true,
    );
  });
});
