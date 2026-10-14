import type { ApiError } from '@tableau-clair/contracts';
import type { ZodType } from 'zod';

/** Erreur métier traduite en réponse HTTP `{ code, message, details? }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  toBody(): ApiError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export const notFound = (what = 'Ressource') =>
  new HttpError(404, 'not_found', `${what} introuvable`);
export const forbidden = () => new HttpError(403, 'forbidden', 'Droits insuffisants');
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Non authentifié');
export const conflict = (current: unknown) =>
  new HttpError(
    409,
    'version_conflict',
    'Cette ressource a été modifiée entre-temps : rechargez-la avant de réessayer.',
    current,
  );
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

/** Valide un corps de requête ; les erreurs deviennent un 400 détaillé. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new HttpError(400, 'invalid_body', 'Requête invalide', result.error.issues);
  }
  return result.data;
}
