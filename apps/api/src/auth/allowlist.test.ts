import { describe, expect, it } from 'vitest';
import { isEmailAllowed, parseAllowedEmails } from './allowlist';
import { createRateLimiter } from './rate-limit';

describe('parseAllowedEmails', () => {
  it('découpe, normalise et ignore les vides', () => {
    expect([...parseAllowedEmails(' A@x.fr, b@Y.fr ;c@z.fr\n,, ')]).toEqual([
      'a@x.fr',
      'b@y.fr',
      'c@z.fr',
    ]);
    expect(parseAllowedEmails(undefined).size).toBe(0);
    expect(parseAllowedEmails('').size).toBe(0);
  });
});

describe('isEmailAllowed', () => {
  const allowed = parseAllowedEmails('martial@racomach.fr');

  it('compare sans tenir compte de la casse ni des espaces', () => {
    expect(isEmailAllowed(allowed, 'Martial@Racomach.fr')).toBe(true);
    expect(isEmailAllowed(allowed, '  martial@racomach.fr ')).toBe(true);
  });

  it('refuse les autres adresses, y compris absentes', () => {
    expect(isEmailAllowed(allowed, 'autre@racomach.fr')).toBe(false);
    expect(isEmailAllowed(allowed, 'martial@racomach.fr.evil.test')).toBe(false);
    expect(isEmailAllowed(allowed, null)).toBe(false);
    expect(isEmailAllowed(allowed, undefined)).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('plafonne par clé sur la fenêtre puis repart', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    now = 1001;
    expect(limiter.take('a')).toBe(true);
  });
});
