import {
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
  try {
    return await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch (error) {
    throw new NetworkError(error);
  }
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
