import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Utilisateur connecté, tel que l'expose `GET /api/me`. */
export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export * from './api';
