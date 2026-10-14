import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('valide la réponse attendue', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('refuse un statut inconnu', () => {
    expect(() => healthResponseSchema.parse({ status: 'maybe' })).toThrow();
  });
});
