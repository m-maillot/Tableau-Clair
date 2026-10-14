import sharp, { type JpegOptions } from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageError, MAX_DIMENSION, processImage } from './images';

const jpeg = (width: number, height: number, options: JpegOptions = {}) =>
  sharp({ create: { width, height, channels: 3, background: '#0F5BFF' } })
    .jpeg(options)
    .toBuffer();

describe('processImage', () => {
  it('ré-encode en WebP sans dépasser la dimension maximale de l’usage', async () => {
    const result = await processImage(await jpeg(4000, 3000), 'element');
    expect(result.mimeType).toBe('image/webp');
    expect(result.width).toBe(MAX_DIMENSION.element);
    expect(result.height).toBe(1200);
    expect((await sharp(result.data).metadata()).format).toBe('webp');
  });

  it('conserve davantage de détail pour une image de fond de plan', async () => {
    const result = await processImage(await jpeg(5000, 2500), 'floor_background');
    expect(result.width).toBe(MAX_DIMENSION.floor_background);
    expect(result.height).toBe(1500);
  });

  it('n’agrandit jamais une petite image', async () => {
    const result = await processImage(await jpeg(300, 200), 'board');
    expect([result.width, result.height]).toEqual([300, 200]);
  });

  it('supprime les métadonnées EXIF, géolocalisation comprise', async () => {
    const withExif = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#fff' },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'secret' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 0/1' },
      })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processImage(withExif, 'element');
    const metadata = await sharp(result.data).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(result.data.includes(Buffer.from('secret'))).toBe(false);
  });

  it('applique l’orientation EXIF avant de la supprimer', async () => {
    // Pixels 400×200 marqués « à tourner de 90° » : le résultat doit être en portrait.
    const rotated = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#000' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processImage(rotated, 'element');
    expect([result.width, result.height]).toEqual([200, 400]);
    expect((await sharp(result.data).metadata()).orientation).toBeUndefined();
  });

  it('accepte PNG et WebP', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: '#0F5BFF' },
    })
      .png()
      .toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    expect((await processImage(png, 'fixture')).width).toBe(20);
    expect((await processImage(webp, 'fixture')).width).toBe(20);
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    await expect(
      processImage(Buffer.from('ceci n’est pas une image'), 'element'),
    ).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });

  it('refuse un format d’image non pris en charge', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    await expect(processImage(gif, 'element')).rejects.toMatchObject({
      code: 'unsupported_format',
    });
  });

  it('refuse une image dépassant la limite de pixels', async () => {
    // 9000×9000 = 81 millions de pixels, compressés en quelques ko.
    const huge = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const error = await processImage(huge, 'element').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageError);
    expect((error as ImageError).code).toBe('image_too_large');
  });
});
