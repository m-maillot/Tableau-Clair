import {
  fixtureSchema,
  floorSchema,
  accountSummarySchema,
  breakerCircuitSchema,
  planSchema,
  roomSchema,
  customModelSchema,
  elementSchema,
  boardImpactSchema,
  boardSchema,
  boardSummarySchema,
  photoSchema,
  meResponseSchema,
  overviewSchema,
  propertySchema,
  searchResultSchema,
  type Board,
  type BoardImpact,
  type BoardSummary,
  type CreateBoardInput,
  type CreateCustomModelInput,
  type CreateFixtureInput,
  type CreateRoomInput,
  type AccountSummary,
  type BreakerCircuit,
  type Fixture,
  type Floor,
  type Plan,
  type Room,
  type SetFixtureLinkInput,
  type UpdateFixtureInput,
  type UpdateFloorInput,
  type UpdateRoomInput,
  type CreateElementInput,
  type CustomModel,
  type Element,
  type UpdateElementInput,
  type CreatePropertyInput,
  type Photo,
  type UpdateBoardInput,
  type MeResponse,
  type Overview,
  type Property,
  type SearchResult,
} from '@tableau-clair/contracts';
import { z } from 'zod';
import { clearSynced, markSynced } from '../net/status';
import { clearOfflineData } from '../pwa/pwa';
import { flagExpired, saveUnsaved, SESSION_EXPIRED_EVENT } from '../net/unsaved';

/** Le serveur n'a pas pu être joint (réseau coupé, serveur arrêté). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Serveur injoignable', { cause });
  }
}

/** Réponse HTTP d'erreur du serveur. */
export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(`Erreur API ${status}${code ? ` (${code})` : ''}`);
  }
}

/** `fetch` same-origin avec session : traduit les échecs en erreurs typées. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      // Sans corps, pas d'en-tête JSON : Fastify refuse un DELETE « JSON » vide (400).
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new NetworkError(error);
  }
  // Session expirée en cours de route : la modification est gardée sur l'appareil, l'écran de
  // connexion est proposé (les appels d'authentification et /api/me gèrent leur propre 401).
  if (
    response.status === 401 &&
    path.startsWith('/api/') &&
    !path.startsWith('/api/auth') &&
    path !== '/api/me'
  ) {
    const method = init.method ?? 'GET';
    if (method !== 'GET') {
      saveUnsaved({ method, path, body: typeof init.body === 'string' ? init.body : null });
    }
    flagExpired();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  // Une lecture réussie depuis le serveur (pas depuis le cache hors ligne) date l'état affiché.
  if (response.ok && (init.method ?? 'GET') === 'GET' && !response.headers.has('x-from-cache')) {
    markSynced();
  }
  return response;
}

async function failure(response: Response): Promise<ApiResponseError> {
  const body = (await response.json().catch(() => undefined)) as
    { code?: string; details?: unknown } | undefined;
  return new ApiResponseError(response.status, body?.code, body?.details);
}

/** Utilisateur connecté, ou `null` si aucune session. */
export async function fetchMe(): Promise<MeResponse | null> {
  const response = await request('/api/me');
  if (response.status === 401) return null;
  if (!response.ok) throw await failure(response);
  return meResponseSchema.parse(await response.json());
}

/** Demande un lien magique. Réponse volontairement identique pour toute adresse (spec §9). */
export async function requestMagicLink(email: string): Promise<void> {
  const response = await request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email, callbackURL: '/', errorCallbackURL: '/connexion' }),
  });
  if (!response.ok) throw await failure(response);
}

/** Démarre la connexion Google : retourne l'adresse vers laquelle rediriger le navigateur. */
export async function startGoogleSignIn(): Promise<string> {
  const response = await request('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: '/connexion' }),
  });
  if (!response.ok) throw await failure(response);
  const { url } = (await response.json()) as { url?: string };
  if (!url) throw new ApiResponseError(response.status, 'missing_url');
  return url;
}

export async function signOut(): Promise<void> {
  const response = await request('/api/auth/sign-out', { method: 'POST', body: '{}' });
  if (!response.ok) throw await failure(response);
  clearOfflineData();
  clearSynced();
}

// --- Logements, tableaux, vue d'ensemble, recherche ----------------------------------------------------

async function getJson<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const response = await request(path);
  if (!response.ok) throw await failure(response);
  return schema.parse(await response.json());
}

export const fetchProperties = (): Promise<Property[]> =>
  getJson('/api/properties', z.array(propertySchema));

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const response = await request('/api/properties', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
  return propertySchema.parse(await response.json());
}

export const fetchBoards = (propertyId: string): Promise<BoardSummary[]> =>
  getJson(`/api/properties/${propertyId}/boards`, z.array(boardSummarySchema));

export const fetchOverview = (propertyId: string): Promise<Overview> =>
  getJson(`/api/properties/${propertyId}/overview`, overviewSchema);

export const searchProperty = (propertyId: string, query: string): Promise<SearchResult[]> =>
  getJson(
    `/api/properties/${propertyId}/search?q=${encodeURIComponent(query)}`,
    z.array(searchResultSchema),
  );

// --- Tableaux : lecture, création, modification, duplication, suppression ------------------------------

export const fetchBoard = (boardId: string): Promise<Board> =>
  getJson(`/api/boards/${boardId}`, boardSchema);

export const fetchBoardImpact = (boardId: string): Promise<BoardImpact> =>
  getJson(`/api/boards/${boardId}/impact`, boardImpactSchema);

async function sendBoard(path: string, method: string, body?: unknown): Promise<Board> {
  const response = await request(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw await failure(response);
  return boardSchema.parse(await response.json());
}

export const createBoard = (propertyId: string, input: CreateBoardInput): Promise<Board> =>
  sendBoard(`/api/properties/${propertyId}/boards`, 'POST', input);

export const updateBoard = (boardId: string, input: UpdateBoardInput): Promise<Board> =>
  sendBoard(`/api/boards/${boardId}`, 'PATCH', input);

export const duplicateBoard = (boardId: string, name?: string): Promise<Board> =>
  sendBoard(`/api/boards/${boardId}/duplicate`, 'POST', name ? { name } : {});

export async function deleteBoard(boardId: string): Promise<void> {
  const response = await request(`/api/boards/${boardId}`, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
}

// --- Photos ----------------------------------------------------------------------------------------------------

export async function uploadPhoto(
  propertyId: string,
  file: Blob,
  usage: 'board' | 'element' | 'fixture' | 'floor_background',
): Promise<Photo> {
  const response = await request(`/api/properties/${propertyId}/photos?usage=${usage}`, {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!response.ok) throw await failure(response);
  return photoSchema.parse(await response.json());
}

export async function deletePhoto(photoId: string): Promise<void> {
  const response = await request(`/api/photos/${photoId}`, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
}

/** Adresse d'affichage d'une photo (redirige vers une URL signée après contrôle des droits). */
export const photoUrl = (photoId: string) => `/api/photos/${photoId}/content`;

// --- Éléments du rail ----------------------------------------------------------------------------------------

export async function createElement(rowId: string, input: CreateElementInput): Promise<Element> {
  const response = await request(`/api/rows/${rowId}/elements`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
  return elementSchema.parse(await response.json());
}

export async function patchElement(elementId: string, input: UpdateElementInput): Promise<Element> {
  const response = await request(`/api/elements/${elementId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
  return elementSchema.parse(await response.json());
}

export async function deleteElement(elementId: string): Promise<void> {
  const response = await request(`/api/elements/${elementId}`, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
}

// --- Modèles d'appareils personnalisés ---------------------------------------------------------------------

export const fetchCustomModels = (): Promise<CustomModel[]> =>
  getJson('/api/custom-models', z.array(customModelSchema));

export async function createCustomModel(input: CreateCustomModelInput): Promise<CustomModel> {
  const response = await request('/api/custom-models', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
  return customModelSchema.parse(await response.json());
}

export async function deleteCustomModel(modelId: string): Promise<void> {
  const response = await request(`/api/custom-models/${modelId}`, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
}

// --- Plan : étages, pièces, équipements ----------------------------------------------------------------------

export const fetchPlan = (propertyId: string): Promise<Plan> =>
  getJson(`/api/properties/${propertyId}/plan`, planSchema);

async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const response = await request(path, { method, body: JSON.stringify(body) });
  if (!response.ok) throw await failure(response);
  return schema.parse(await response.json());
}

async function remove(path: string): Promise<void> {
  const response = await request(path, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
}

export const createFloor = (propertyId: string, name: string): Promise<Floor> =>
  sendJson(`/api/properties/${propertyId}/floors`, 'POST', { name }, floorSchema);
export const updateFloor = (floorId: string, input: UpdateFloorInput): Promise<Floor> =>
  sendJson(`/api/floors/${floorId}`, 'PATCH', input, floorSchema);
export const reorderFloors = (propertyId: string, ids: string[]): Promise<Floor[]> =>
  sendJson(`/api/properties/${propertyId}/floors/order`, 'PUT', { ids }, z.array(floorSchema));
export const deleteFloor = (floorId: string) => remove(`/api/floors/${floorId}`);

export const createRoom = (floorId: string, input: CreateRoomInput): Promise<Room> =>
  sendJson(`/api/floors/${floorId}/rooms`, 'POST', input, roomSchema);
export const updateRoom = (roomId: string, input: UpdateRoomInput): Promise<Room> =>
  sendJson(`/api/rooms/${roomId}`, 'PATCH', input, roomSchema);
export const deleteRoom = (roomId: string) => remove(`/api/rooms/${roomId}`);

export const createFixture = (roomId: string, input: CreateFixtureInput): Promise<Fixture> =>
  sendJson(`/api/rooms/${roomId}/fixtures`, 'POST', input, fixtureSchema);
export const updateFixture = (fixtureId: string, input: UpdateFixtureInput): Promise<Fixture> =>
  sendJson(`/api/fixtures/${fixtureId}`, 'PATCH', input, fixtureSchema);
export const deleteFixture = (fixtureId: string) => remove(`/api/fixtures/${fixtureId}`);

// --- Liaisons équipement ↔ disjoncteur -----------------------------------------------------------------------

export const linkFixture = (fixtureId: string, input: SetFixtureLinkInput): Promise<Fixture> =>
  sendJson(`/api/fixtures/${fixtureId}/link`, 'PUT', input, fixtureSchema);

export async function unlinkFixture(fixtureId: string): Promise<Fixture> {
  const response = await request(`/api/fixtures/${fixtureId}/link`, { method: 'DELETE' });
  if (!response.ok) throw await failure(response);
  return fixtureSchema.parse(await response.json());
}

export const fetchBreakerCircuit = (elementId: string): Promise<BreakerCircuit> =>
  getJson(`/api/elements/${elementId}/circuit`, breakerCircuitSchema);

// --- Compte ----------------------------------------------------------------------------------------------------

export const fetchAccount = (): Promise<AccountSummary> =>
  getJson('/api/account', accountSummarySchema);

/** Export JSON complet du compte : le fichier tel que le serveur le produit. */
export async function fetchAccountExport(): Promise<{ blob: Blob; fileName: string }> {
  const response = await request('/api/account/export');
  if (!response.ok) throw await failure(response);
  const header = response.headers.get('content-disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(header)?.[1] ?? 'tableau-clair-export.json';
  return { blob: await response.blob(), fileName };
}

export async function deleteAccount(confirm: string): Promise<void> {
  const response = await request('/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirm }),
  });
  if (!response.ok) throw await failure(response);
  clearOfflineData();
  clearSynced();
}

// --- Tableau posé sur le plan --------------------------------------------------------------------------------

export async function setBoardPlan(
  boardId: string,
  input: { floorId: string; x: number; y: number },
): Promise<void> {
  const response = await request(`/api/boards/${boardId}/plan`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
}
