import { meResponseSchema, type MeResponse } from '@tableau-clair/contracts';

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
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return new ApiResponseError(response.status, body?.code);
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
