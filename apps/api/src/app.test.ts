import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('GET /api/health', () => {
  it('répond ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('répond 503 quand la base est indisponible', async () => {
    const app = buildApp({
      checkDatabase: async () => {
        throw new Error('connexion refusée');
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'error' });
  });

  it('répond 200 quand la base répond', async () => {
    const app = buildApp({ checkDatabase: async () => [{ '?column?': 1 }] });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });
});
