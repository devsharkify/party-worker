import { Injectable, Logger } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "../config/env";
import type { PutResult, StorageProvider } from "./storage.provider";

/**
 * Cloudflare R2 via its S3-compatible API. Fixes the production data-loss
 * hole: LocalStorageProvider writes to the Railway container disk, so every
 * redeploy wipes uploaded creatives/renders/photos.
 *
 * Required env (STORAGE_PROVIDER=r2):
 *  - R2_ACCOUNT_ID      Cloudflare account id (endpoint becomes
 *                       https://<account>.r2.cloudflarestorage.com)
 *  - R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY   R2 API token pair
 *  - R2_BUCKET          bucket name
 *  - R2_PUBLIC_BASE     public serving base (r2.dev public bucket URL or a
 *                       custom domain) — used for publicUrl()
 */
@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly log = new Logger("R2StorageProvider");
  private readonly env = loadEnv();
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = this.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      // Fail loudly at boot — a half-configured R2 silently losing uploads is
      // exactly the failure mode this provider exists to prevent.
      throw new Error(
        "STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET",
      );
    }
    this.bucket = R2_BUCKET;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    this.log.log(`R2 storage active (bucket=${this.bucket})`);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<PutResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        // Creatives are immutable once uploaded — let the CDN cache hard.
        CacheControl: "public, max-age=604800, immutable",
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    const base = this.env.R2_PUBLIC_BASE?.replace(/\/$/, "");
    return `${base}/${key}`;
  }

  async signedUrl(key: string, ttlSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}
