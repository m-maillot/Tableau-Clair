import type { PhotoUsage } from '@tableau-clair/domain';
import sharp from 'sharp';

/** Plus grande dimension conservée, selon l'usage : un plan a besoin de plus de détail qu'une photo. */
export const MAX_DIMENSION: Record<PhotoUsage, number> = {
  board: 1600,
  element: 1600,
  fixture: 1600,
  floor_background: 3000,
};

/** Au-delà, l'image est refusée avant d'être décodée (protection mémoire). */
const MAX_INPUT_PIXELS = 60_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ImageError extends Error {
  constructor(
    readonly code: 'invalid_image' | 'unsupported_format' | 'image_too_large',
    message: string,
  ) {
    super(message);
  }
}

export interface ProcessedImage {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

/**
 * Valide le contenu réel du fichier (et non l'en-tête annoncé), applique l'orientation EXIF,
 * supprime toutes les métadonnées (géolocalisation comprise), réduit et ré-encode en WebP.
 */
export async function processImage(input: Buffer, usage: PhotoUsage): Promise<ProcessedImage> {
  return reencode(input, MAX_DIMENSION[usage], 80);
}

/** Plus grande dimension envoyée à l'analyse : au-delà, l'API réduit l'image de toute façon. */
export const ANALYSIS_MAX_DIMENSION = 1568;

/**
 * Prépare une photo pour l'analyse par IA : mêmes contrôles et même suppression des métadonnées que
 * `processImage`, mais sans usage de photo ni stockage. Qualité plus haute pour garder les étiquettes lisibles.
 */
export function prepareForAnalysis(input: Buffer): Promise<ProcessedImage> {
  return reencode(input, ANALYSIS_MAX_DIMENSION, 88);
}

async function reencode(input: Buffer, max: number, quality: number): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    format = metadata.format;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/pixel limit/i.test(message)) {
      throw new ImageError('image_too_large', 'Image trop grande');
    }
    throw new ImageError('invalid_image', 'Fichier image illisible');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ImageError('unsupported_format', 'Format non pris en charge (JPEG, PNG ou WebP)');
  }

  try {
    // `rotate()` sans argument applique l'orientation EXIF ; sans `withMetadata`, rien n'est conservé.
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw new ImageError('invalid_image', 'Fichier image illisible');
  }
}
