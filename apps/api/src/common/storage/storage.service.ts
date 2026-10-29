import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Thin abstraction over S3-compatible object storage (MinIO locally, S3 in
 * production — docs/ARCHITECTURE.md §4). Nothing above this service knows
 * it's talking to MinIO specifically; swapping providers means changing
 * env vars, not code.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger("StorageService");
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "legarage-attachments";
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "legarage",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "legarage123",
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created object storage bucket "${this.bucket}"`);
      } catch (err) {
        this.logger.warn(
          `Could not verify/create bucket "${this.bucket}" — file uploads will fail until it exists: ${err}`,
        );
      }
    }
  }

  /**
   * A presigned PUT URL scoped to one exact key and content-type, short-
   * lived (docs/SECURITY.md §7). The API never proxies file bytes.
   */
  async presignUpload(key: string, mimeType: string, expiresInSeconds = 300): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async presignRead(key: string, expiresInSeconds = 600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Confirms an object was actually uploaded (and reads its real size) before trusting a client's "I uploaded it" claim. */
  async headObject(key: string): Promise<{ exists: boolean; sizeBytes?: number; contentType?: string }> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { exists: true, sizeBytes: res.ContentLength, contentType: res.ContentType };
    } catch {
      return { exists: false };
    }
  }

  /** Server-side copy — each organization keeps its own object for its own records (docs/WORK-ORDERS.md). */
  async copyObject(sourceKey: string, targetKey: string): Promise<void> {
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${sourceKey}`, Key: targetKey }));
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
