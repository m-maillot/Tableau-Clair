import { eq, schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { Mail } from '../mailer';
import { createAuth } from './auth';

const APP_URL = 'https://app.test';
const ALLOWED = 'martial@racomach.fr';

let t: TestDatabase;
let db: Database;
let ipCounter = 0;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
});
afterAll(async () => {
  await t.drop();
});

function setup(options: { allowed?: string[]; google?: boolean; perEmail?: number } = {}) {
  const sent: Mail[] = [];
  const warnings: Record<string, unknown>[] = [];
  const allowed = new Set(options.allowed ?? [ALLOWED]);
  const auth = createAuth({
    db,
    mailer: { send: async (mail) => void sent.push(mail) },
    logger: { warn: (details, message) => void warnings.push({ ...details, message }) },
    appUrl: APP_URL,
    secret: 'un-secret-de-test-suffisamment-long-0123456789',
    allowedEmails: () => allowed,
    google: options.google ? { clientId: 'client-id', clientSecret: 'client-secret' } : undefined,
    ...(options.perEmail ? { magicLinkPerEmail: options.perEmail } : {}),
  });
  const app = buildApp({ auth: { instance: auth, appUrl: APP_URL } });
  const ip = `10.0.0.${++ipCounter}`;

  const requestLink = (email: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email, callbackURL: '/' },
      headers: { origin: APP_URL, 'x-forwarded-for': ip, ...headers },
    });

  const linkFromMail = () => {
    const match = sent.at(-1)?.text.match(/https?:\/\/\S+/);
    if (!match) throw new Error('aucun lien dans le dernier e-mail');
    const url = new URL(match[0]);
    return url.pathname + url.search;
  };

  const verify = (path: string) =>
    app.inject({ method: 'GET', url: path, headers: { 'x-forwarded-for': ip } });

  const cookieHeader = (setCookie: string | string[] | undefined) =>
    [setCookie ?? []]
      .flat()
      .map((c) => c.split(';')[0])
      .join('; ');

  return {
    app,
    auth,
    sent,
    warnings,
    allowed,
    requestLink,
    linkFromMail,
    verify,
    cookieHeader,
    ip,
  };
}

const userCount = async (email: string) =>
  (await db.select().from(schema.users).where(eq(schema.users.email, email))).length;

describe('lien magique', () => {
  it('connecte une adresse autorisée de bout en bout', async () => {
    const s = setup();
    const response = await s.requestLink(ALLOWED);
    expect(response.statusCode).toBe(200);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]?.to).toBe(ALLOWED);

    const verified = await s.verify(s.linkFromMail());
    expect(verified.statusCode).toBe(302);
    expect(verified.headers.location).not.toMatch(/error/i);

    const cookie = s.cookieHeader(verified.headers['set-cookie']);
    expect(cookie).toMatch(/session_token=/);

    const me = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: ALLOWED });
  });

  it('pose un cookie de session HttpOnly, SameSite et Secure', async () => {
    const s = setup();
    await s.requestLink(ALLOWED);
    const verified = await s.verify(s.linkFromMail());
    const sessionCookie = [verified.headers['set-cookie'] ?? []]
      .flat()
      .find((c) => /session_token=/.test(c));
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Secure/i);
  });

  it('répond de façon neutre à une adresse refusée, sans e-mail ni compte', async () => {
    const s = setup();
    const refused = await s.requestLink('intrus@example.test');
    const accepted = await s.requestLink(ALLOWED);

    expect(refused.statusCode).toBe(accepted.statusCode);
    expect(refused.json()).toEqual(accepted.json());
    expect(s.sent.map((m) => m.to)).toEqual([ALLOWED]);
    expect(await userCount('intrus@example.test')).toBe(0);
    expect(s.warnings.some((w) => w.email === 'intrus@example.test')).toBe(true);
  });

  it('est insensible à la casse de l’adresse', async () => {
    const s = setup();
    await s.requestLink('Martial@Racomach.FR');
    expect(s.sent).toHaveLength(1);
  });

  it('refuse un lien expiré', async () => {
    const s = setup();
    await s.requestLink(ALLOWED);
    const path = s.linkFromMail();
    await t.pool.query(`UPDATE verifications SET expires_at = now() - interval '1 minute'`);

    const verified = await s.verify(path);
    expect(verified.statusCode).toBe(302);
    expect(verified.headers.location).toMatch(/error/i);
    expect(s.cookieHeader(verified.headers['set-cookie'])).not.toMatch(/session_token=/);
  });

  it('refuse un lien déjà utilisé', async () => {
    const s = setup();
    await s.requestLink(ALLOWED);
    const path = s.linkFromMail();

    const first = await s.verify(path);
    expect(s.cookieHeader(first.headers['set-cookie'])).toMatch(/session_token=/);

    const second = await s.verify(path);
    expect(second.headers.location).toMatch(/error/i);
    expect(s.cookieHeader(second.headers['set-cookie'])).not.toMatch(/session_token=/);
  });

  it('refuse une session si l’adresse a été retirée de la liste entre-temps', async () => {
    const s = setup();
    await s.requestLink(ALLOWED);
    const path = s.linkFromMail();
    s.allowed.delete(ALLOWED);

    const verified = await s.verify(path);
    expect(verified.headers.location).toMatch(/error/i);
    expect(s.cookieHeader(verified.headers['set-cookie'])).not.toMatch(/session_token=/);
  });

  it('ne stocke pas le jeton en clair', async () => {
    const s = setup();
    await s.requestLink(ALLOWED);
    const token = new URL(`${APP_URL}${s.linkFromMail()}`).searchParams.get('token')!;
    const rows = await t.pool.query('SELECT identifier, value FROM verifications');
    const stored = JSON.stringify(rows.rows);
    expect(stored).not.toContain(token);
  });
});

describe('limitation de débit', () => {
  it('plafonne les liens par adresse sans révéler le blocage', async () => {
    const s = setup({ perEmail: 2 });
    for (let i = 0; i < 4; i++) {
      const response = await s.requestLink(ALLOWED);
      expect(response.statusCode).toBe(200);
    }
    expect(s.sent).toHaveLength(2);
    expect(s.warnings.some((w) => String(w.message).includes('trop de demandes'))).toBe(true);
  });

  it('plafonne les demandes par IP', async () => {
    const s = setup({ perEmail: 100 });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await s.requestLink(ALLOWED)).statusCode);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses).toContain(429);
  });
});

describe('protection CSRF', () => {
  async function signedIn() {
    const s = setup();
    await s.requestLink(ALLOWED);
    const verified = await s.verify(s.linkFromMail());
    return { s, cookie: s.cookieHeader(verified.headers['set-cookie']) };
  }

  it('refuse une action authentifiée venant d’une autre origine', async () => {
    const { s, cookie } = await signedIn();
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      payload: {},
      headers: { cookie, origin: 'https://evil.test', 'x-forwarded-for': s.ip },
    });
    expect(response.statusCode).toBe(403);

    const me = await s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200); // la session est intacte
  });

  it('accepte la même action depuis l’origine de l’application', async () => {
    const { s, cookie } = await signedIn();
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      payload: {},
      headers: { cookie, origin: APP_URL, 'x-forwarded-for': s.ip },
    });
    expect(response.statusCode).toBe(200);
  });

  it('refuse une redirection de retour vers un autre domaine', async () => {
    const s = setup();
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: ALLOWED, callbackURL: 'https://evil.test/' },
      headers: { origin: APP_URL, 'x-forwarded-for': s.ip },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(s.sent).toHaveLength(0);
  });
});

describe('session', () => {
  it('répond 401 sans session', async () => {
    const s = setup();
    const response = await s.app.inject({ method: 'GET', url: '/api/me' });
    expect(response.statusCode).toBe(401);
  });
});

describe('Google', () => {
  it('redirige vers Google quand le fournisseur est configuré', async () => {
    const s = setup({ google: true });
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
      headers: { origin: APP_URL, 'x-forwarded-for': s.ip },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().url).toContain('accounts.google.com');
  });

  it('n’expose pas Google sans identifiants', async () => {
    const s = setup({ google: false });
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
      headers: { origin: APP_URL, 'x-forwarded-for': s.ip },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
