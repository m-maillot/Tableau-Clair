import { customModelSchema } from '@tableau-clair/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from './harness';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.drop();
});

const model = (label: string, extra: Record<string, unknown> = {}) => ({
  label,
  width: 2,
  ...extra,
});

describe('modèles personnalisés', () => {
  it('exige une session', async () => {
    expect((await h.call(null, 'GET', '/api/custom-models')).status).toBe(401);
    expect((await h.call(null, 'POST', '/api/custom-models', model('X'))).status).toBe(401);
  });

  it('crée un modèle avec ses cinq champs et le renvoie conforme au contrat', async () => {
    const user = await h.createUser();
    const response = await h.call(
      user,
      'POST',
      '/api/custom-models',
      model('Borne de recharge', {
        role: 'Voiture électrique',
        brand: 'Wallbox',
        model: 'Pulsar',
        width: 3,
      }),
    );
    expect(response.status).toBe(201);
    const created = customModelSchema.parse(response.body);
    expect(created).toMatchObject({
      label: 'Borne de recharge',
      role: 'Voiture électrique',
      brand: 'Wallbox',
      model: 'Pulsar',
      width: 3,
      updatedBy: user,
      version: 1,
    });
  });

  it('liste les modèles du compte par ordre alphabétique', async () => {
    const user = await h.createUser();
    await h.call(user, 'POST', '/api/custom-models', model('Zébulon'));
    await h.call(user, 'POST', '/api/custom-models', model('Alarme'));

    const list = (await h.call(user, 'GET', '/api/custom-models')).body as { label: string }[];
    expect(list.map((m) => m.label)).toEqual(['Alarme', 'Zébulon']);
  });

  it('isole les comptes : on ne voit ni ne supprime les modèles des autres', async () => {
    const alice = await h.createUser();
    const bob = await h.createUser();
    const created = (await h.call(alice, 'POST', '/api/custom-models', model('Privé'))).body;

    expect((await h.call(bob, 'GET', '/api/custom-models')).body).toEqual([]);
    expect((await h.call(bob, 'DELETE', `/api/custom-models/${created.id}`)).status).toBe(404);
    expect((await h.call(alice, 'GET', '/api/custom-models')).body).toHaveLength(1);
  });

  it('supprime un modèle', async () => {
    const user = await h.createUser();
    const created = (await h.call(user, 'POST', '/api/custom-models', model('Éphémère'))).body;
    expect((await h.call(user, 'DELETE', `/api/custom-models/${created.id}`)).status).toBe(204);
    expect((await h.call(user, 'GET', '/api/custom-models')).body).toEqual([]);
    expect((await h.call(user, 'DELETE', `/api/custom-models/${created.id}`)).status).toBe(404);
  });

  it('valide le corps', async () => {
    const user = await h.createUser();
    for (const body of [
      { width: 2 },
      { label: '  ', width: 2 },
      { label: 'X', width: 0 },
      { label: 'X', width: 99 },
      { label: 'X', width: 2, inconnu: true },
    ]) {
      expect((await h.call(user, 'POST', '/api/custom-models', body)).status).toBe(400);
    }
  });

  it('traite un identifiant mal formé comme introuvable', async () => {
    const user = await h.createUser();
    expect((await h.call(user, 'DELETE', '/api/custom-models/nope')).status).toBe(404);
  });
});
