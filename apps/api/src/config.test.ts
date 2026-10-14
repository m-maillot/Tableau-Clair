import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  APP_URL: 'https://tableau-clair.fr',
  AUTH_SECRET: 'un-secret-de-test-suffisamment-long-0123456789',
  ALLOWED_EMAILS: 'martial@racomach.fr',
  SMTP_HOST: 'smtp.test',
  SMTP_PORT: '587',
  MAIL_FROM: 'Tableau Clair <no-reply@tableau-clair.fr>',
};

describe('loadConfig', () => {
  it('lit une configuration valide', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production' });
    expect(config.appUrl).toBe('https://tableau-clair.fr');
    expect(config.allowedEmails.has('martial@racomach.fr')).toBe(true);
    expect(config.google).toBeUndefined();
    expect(config.smtp.port).toBe(587);
  });

  it('active Google seulement si identifiant et secret sont fournis', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id' }).google).toBeUndefined();
    expect(
      loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google,
    ).toEqual({ clientId: 'id', clientSecret: 's' });
  });

  it('refuse une liste vide, un secret court et les valeurs d’exemple en production', () => {
    expect(() => loadConfig({ ...base, ALLOWED_EMAILS: '' })).toThrow(/ALLOWED_EMAILS/);
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'court' })).toThrow(/AUTH_SECRET/);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', AUTH_SECRET: 'change-me'.repeat(5) }),
    ).toThrow(/valeur d’exemple/);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', APP_URL: 'http://tableau-clair.fr' }),
    ).toThrow(/https/);
  });
});
