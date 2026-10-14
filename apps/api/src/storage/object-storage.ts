import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** Requis par MinIO et certains S3 compatibles : le bucket est dans le chemin, pas le domaine. */
  forcePathStyle: boolean;
}

/** Stockage d'objets privé : les fichiers ne sont jamais servis sans contrôle de droits. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Suppression groupée, au mieux : retourne les clés qui n'ont pas pu être supprimées. */
  deleteMany(keys: string[]): Promise<string[]>;
  /** URL de lecture signée, valable `ttlSeconds` secondes. */
  signedGetUrl(key: string, ttlSeconds: number): Promise<string>;
}

export function createS3Client(config: S3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // Les sommes de contrôle automatiques du SDK récent sont refusées par plusieurs S3 compatibles.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export function createS3Storage(config: S3Config, client = createS3Client(config)): ObjectStorage {
  const Bucket = config.bucket;

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Le contenu d'un objet ne change jamais : une nouvelle photo a une nouvelle clé.
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async deleteMany(keys) {
      const failed: string[] = [];
      // L'API accepte 1000 clés par appel.
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        for (const error of result.Errors ?? []) if (error.Key) failed.push(error.Key);
      }
      return failed;
    },

    signedGetUrl(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },
  };
}
