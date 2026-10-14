import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  createS3Client,
  createS3Storage,
  type ObjectStorage,
  type S3Config,
} from './object-storage';

/**
 * Bucket jetable sur le MinIO de `docker compose up -d` (ou `TEST_S3_ENDPOINT`).
 * Les tests d'intégration parlent à un vrai stockage S3, pas à une simulation.
 */
export interface TestBucket {
  storage: ObjectStorage;
  config: S3Config;
  listKeys: () => Promise<string[]>;
  drop: () => Promise<void>;
}

export async function createTestBucket(): Promise<TestBucket> {
  const config: S3Config = {
    endpoint: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9010',
    region: 'us-east-1',
    bucket: `tc-test-${randomUUID()}`,
    accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.TEST_S3_SECRET_KEY ?? 'minioadmin',
    forcePathStyle: true,
  };
  const client = createS3Client(config);

  try {
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  } catch (error) {
    throw new Error(
      `Stockage S3 injoignable (${config.endpoint}). Lancez \`docker compose up -d\` ou définissez TEST_S3_ENDPOINT.`,
      { cause: error },
    );
  }

  const listKeys = async () => {
    const result = await client.send(new ListObjectsV2Command({ Bucket: config.bucket }));
    return (result.Contents ?? []).map((o) => o.Key!).sort();
  };

  return {
    storage: createS3Storage(config, client),
    config,
    listKeys,
    drop: async () => {
      const keys = await listKeys();
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      await client.send(new DeleteBucketCommand({ Bucket: config.bucket }));
      client.destroy();
    },
  };
}
