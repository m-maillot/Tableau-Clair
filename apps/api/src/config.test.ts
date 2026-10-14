import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  APP_URL: 'https://tableau-clair.fr',
  AUTH_SECRET: 'un-secret-de-test-suffisamment-long-0123456789',
  ALLOWED_EMAILS: 'martial@racomach.fr',
  SMTP_HOST: 'smtp.test',
  SMTP_PORT: '587',
  MAIL_FROM: 'Tableau Clair <no-reply@tableau-clair.fr>',
  S3_ENDPOINT: 'https://s3.test',
  S3_BUCKET: 'tableau-clair',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

describe('loadConfig', () => {
  it('lit une configuration valide', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production' });
    expect(config.appUrl).toBe('https://tableau-clair.fr');
    expect(config.allowedEmails.has('martial@racomach.fr')).toBe(true);
    expect(config.google).toBeUndefined();
    expect(config.smtp.port).toBe(587);
    expect(config.s3).toMatchObject({
      bucket: 'tableau-clair',
      region: 'us-east-1',
      forcePathStyle: false,
    });
  });

  it('active Google seulement si identifiant et secret sont fournis', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id' }).google).toBeUndefined();
    expect(
      loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google,
    ).toEqual({ clientId: 'id', clientSecret: 's' });
  });

  it('exige la configuration du stockage objet', () => {
    expect(() => loadConfig({ ...base, S3_BUCKET: '' })).toThrow(/S3_BUCKET/);
    expect(loadConfig({ ...base, S3_FORCE_PATH_STYLE: 'true' }).s3.forcePathStyle).toBe(true);
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
