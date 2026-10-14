import { photoSchema, type Board } from '@tableau-clair/contracts';
import { eq, schema, type Database } from '@tableau-clair/db';
import { createTestDatabase, type TestDatabase } from '@tableau-clair/db/testing';
import type { Role } from '@tableau-clair/domain';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createTestBucket, type TestBucket } from '../storage/testing';
import { SIGNED_URL_TTL_SECONDS } from './photos';

let t: TestDatabase;
let db: Database;
let bucket: TestBucket;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDatabase();
  db = t.db;
  bucket = await createTestBucket();
  app = buildApp({
    api: {
      db,
      storage: bucket.storage,
      resolveUserId: async (request) => {
        const header = request.headers['x-user-id'];
        return typeof header === 'string' ? header : null;
      },
    },
  });
});
afterAll(async () => {
  await bucket.drop();
  await t.drop();
});

async function createUser() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${crypto.randomUUID()}@test.local` })
    .returning();
  return user!.id;
}

async function json(
  userId: string,
  method: 'POST' | 'DELETE' | 'PATCH' | 'GET',
  url: string,
  payload?: object,
) {
  const response = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    headers: { 'x-user-id': userId },
  });
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined,
  };
}

function upload(
  userId: string,
  propertyId: string,
  body: Buffer,
  options: { usage?: string; type?: string } = {},
) {
  const usage =
    options.usage === undefined ? '?usage=element' : options.usage ? `?usage=${options.usage}` : '';
  return app.inject({
    method: 'POST',
    url: `/api/properties/${propertyId}/photos${usage}`,
    payload: body,
    headers: { 'x-user-id': userId, 'content-type': options.type ?? 'image/jpeg' },
  });
}

const jpeg = (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: '#C5F26A' } })
    .jpeg()
    .toBuffer();

async function setup() {
  const owner = await createUser();
  const property = (await json(owner, 'POST', '/api/properties', { name: 'Maison' })).body;
  return { owner, property };
}

async function addMember(propertyId: string, role: Role) {
  const userId = await createUser();
  await db.insert(schema.memberships).values({ propertyId, userId, role });
  return userId;
}

describe('envoi', () => {
  it('enregistre une photo réduite, sans EXIF, et la décrit conformément au contrat', async () => {
    const { owner, property } = await setup();
    const original = await sharp({
      create: { width: 3200, height: 2000, channels: 3, background: '#000' },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret' } })
      .toBuffer();

    const response = await upload(owner, property.id, original, { usage: 'board' });
    expect(response.statusCode).toBe(201);
    const photo = photoSchema.parse(response.json());
    expect(photo).toMatchObject({
      propertyId: property.id,
      usage: 'board',
      mimeType: 'image/webp',
      width: 1600,
      height: 1000,
      updatedBy: owner,
    });

    const keys = await bucket.listKeys();
    expect(keys).toContain(`properties/${property.id}/${photo.id}.webp`);

    // Le contenu réellement stocké est celui qui a été traité.
    const stored = await fetch(
      await bucket.storage.signedGetUrl(`properties/${property.id}/${photo.id}.webp`, 60),
    );
    const bytes = Buffer.from(await stored.arrayBuffer());
    expect(bytes.length).toBe(photo.sizeBytes);
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
  });

  it('refuse les rôles insuffisants et les non-membres', async () => {
    const { property } = await setup();
    const viewer = await addMember(property.id, 'viewer');
    const stranger = await createUser();
    const image = await jpeg();

    expect((await upload(viewer, property.id, image)).statusCode).toBe(403);
    expect((await upload(stranger, property.id, image)).statusCode).toBe(404);
  });

  it('exige un usage connu', async () => {
    const { owner, property } = await setup();
    const image = await jpeg();
    expect((await upload(owner, property.id, image, { usage: '' })).statusCode).toBe(400);
    const unknown = await upload(owner, property.id, image, { usage: 'avatar' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().code).toBe('invalid_usage');
  });

  it('refuse un fichier qui n’est pas une image, malgré l’en-tête annoncé', async () => {
    const { owner, property } = await setup();
    const response = await upload(owner, property.id, Buffer.from('<script>alert(1)</script>'));
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('invalid_image');
    expect(await bucket.listKeys()).not.toEqual(
      expect.arrayContaining([expect.stringContaining(property.id)]),
    );
  });

  it('refuse un format non pris en charge (415)', async () => {
    const { owner, property } = await setup();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    const response = await upload(owner, property.id, gif, { type: 'image/png' });
    expect(response.statusCode).toBe(415);
    expect(response.json().code).toBe('unsupported_format');

    const text = await upload(owner, property.id, Buffer.from('x'), { type: 'text/plain' });
    expect(text.statusCode).toBe(415);
  });

  it('refuse un fichier trop volumineux (413)', async () => {
    const { owner, property } = await setup();
    const response = await upload(owner, property.id, Buffer.alloc(16 * 1024 * 1024));
    expect(response.statusCode).toBe(413);
  });

  it('refuse un corps vide', async () => {
    const { owner, property } = await setup();
    const response = await upload(owner, property.id, Buffer.alloc(0));
    expect(response.statusCode).toBe(400);
  });
});

describe('lecture', () => {
  async function uploaded() {
    const { owner, property } = await setup();
    const response = await upload(owner, property.id, await jpeg(), { usage: 'element' });
    return { owner, property, photo: photoSchema.parse(response.json()) };
  }

  it('redirige un membre vers une URL signée de courte durée qui sert l’image', async () => {
    const { property, photo } = await uploaded();
    const viewer = await addMember(property.id, 'viewer');

    const response = await app.inject({
      method: 'GET',
      url: photo.contentUrl,
      headers: { 'x-user-id': viewer },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers['cache-control']).toMatch(/no-store/);

    const location = new URL(response.headers.location as string);
    expect(location.searchParams.get('X-Amz-Expires')).toBe(String(SIGNED_URL_TTL_SECONDS));
    expect(location.searchParams.get('X-Amz-Signature')).toBeTruthy();

    const file = await fetch(location);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');
  });

  it('garde le bucket privé : l’adresse sans signature est refusée', async () => {
    const { property, photo } = await uploaded();
    const unsigned = `${bucket.config.endpoint}/${bucket.config.bucket}/properties/${property.id}/${photo.id}.webp`;
    expect((await fetch(unsigned)).status).toBe(403);
  });

  it('ne signe rien pour un non-membre', async () => {
    const { photo } = await uploaded();
    const stranger = await createUser();
    for (const url of [photo.contentUrl, `/api/photos/${photo.id}`]) {
      const response = await app.inject({ method: 'GET', url, headers: { 'x-user-id': stranger } });
      expect(response.statusCode).toBe(404);
      expect(response.headers.location).toBeUndefined();
    }
  });

  it('exige une session', async () => {
    const { photo } = await uploaded();
    const response = await app.inject({ method: 'GET', url: photo.contentUrl });
    expect(response.statusCode).toBe(401);
  });
});

describe('utilisation et suppression', () => {
  it('rattache une photo à un élément, puis la détache à sa suppression', async () => {
    const { owner, property } = await setup();
    const board: Board = (
      await json(owner, 'POST', `/api/properties/${property.id}/boards`, {
        name: 'Tableau',
        rowCount: 1,
        modulesPerRow: 12,
      })
    ).body;
    const photo = photoSchema.parse((await upload(owner, property.id, await jpeg())).json());

    const element = await json(owner, 'POST', `/api/rows/${board.rows[0]!.id}/elements`, {
      position: 0,
      width: 1,
      kind: 'breaker',
      label: 'Cuisine',
      photoId: photo.id,
    });
    expect(element.status).toBe(201);
    expect(element.body.photoId).toBe(photo.id);

    const key = `properties/${property.id}/${photo.id}.webp`;
    expect(await bucket.listKeys()).toContain(key);

    const removed = await json(owner, 'DELETE', `/api/photos/${photo.id}`);
    expect(removed.status).toBe(204);
    expect(await bucket.listKeys()).not.toContain(key);

    const after = await json(owner, 'GET', `/api/elements/${element.body.id}`);
    expect(after.body.photoId).toBeNull();
    expect((await json(owner, 'GET', `/api/photos/${photo.id}`)).status).toBe(404);
  });

  it('réserve la suppression aux éditeurs', async () => {
    const { owner, property } = await setup();
    const photo = photoSchema.parse((await upload(owner, property.id, await jpeg())).json());
    const viewer = await addMember(property.id, 'viewer');
    expect((await json(viewer, 'DELETE', `/api/photos/${photo.id}`)).status).toBe(403);
    expect((await json(owner, 'GET', `/api/photos/${photo.id}`)).status).toBe(200);
  });

  it('supprime les fichiers d’un logement avec le logement', async () => {
    const { owner, property } = await setup();
    const first = photoSchema.parse((await upload(owner, property.id, await jpeg())).json());
    const second = photoSchema.parse(
      (await upload(owner, property.id, await jpeg(), { usage: 'floor_background' })).json(),
    );
    const before = await bucket.listKeys();
    expect(before).toEqual(
      expect.arrayContaining([
        `properties/${property.id}/${first.id}.webp`,
        `properties/${property.id}/${second.id}.webp`,
      ]),
    );

    expect((await json(owner, 'DELETE', `/api/properties/${property.id}`)).status).toBe(204);
    const after = await bucket.listKeys();
    expect(after.filter((k) => k.includes(property.id))).toEqual([]);
    expect(
      await db.select().from(schema.photos).where(eq(schema.photos.propertyId, property.id)),
    ).toHaveLength(0);
  });
});
