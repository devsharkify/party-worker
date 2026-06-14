import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env";
import type { PutResult, StorageProvider } from "./storage.provider";

/**
 * ImageKit storage provider. Uploads files to ImageKit's upload API and
 * serves them via the ImageKit CDN with on-the-fly transformations.
 *
 * Required env (STORAGE_PROVIDER=imagekit):
 *   IK_PRIVATE_KEY    ImageKit private API key
 *   IK_URL_ENDPOINT   ImageKit URL endpoint, e.g. https://ik.imagekit.io/your_id
 */
@Injectable()
export class ImageKitStorageProvider implements StorageProvider {
  private readonly log = new Logger("ImageKitStorageProvider");
  private readonly env = loadEnv();

  constructor() {
    const { IK_PRIVATE_KEY, IK_URL_ENDPOINT } = this.env;
    if (!IK_PRIVATE_KEY || !IK_URL_ENDPOINT) {
      throw new Error(
        "STORAGE_PROVIDER=imagekit requires IK_PRIVATE_KEY and IK_URL_ENDPOINT",
      );
    }
    this.log.log(`ImageKit storage active (endpoint=${IK_URL_ENDPOINT})`);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<PutResult> {
    const folder = key.includes("/") ? key.substring(0, key.lastIndexOf("/")) : "/";
    const fileName = key.includes("/") ? key.substring(key.lastIndexOf("/") + 1) : key;

    const form = new FormData();
    form.append("file", new Blob([data], { type: contentType }), fileName);
    form.append("fileName", fileName);
    form.append("folder", folder);
    form.append("useUniqueFileName", "false");

    const auth = Buffer.from(`${this.env.IK_PRIVATE_KEY}:`).toString("base64");
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`ImageKit upload failed (${res.status}): ${json?.message ?? "unknown"}`);
    }

    const url = (json.url as string) ?? this.publicUrl(key);
    return { key, url };
  }

  publicUrl(key: string): string {
    const base = this.env.IK_URL_ENDPOINT!.replace(/\/$/, "");
    return `${base}/${key}`;
  }

  async signedUrl(key: string, _ttlSeconds?: number): Promise<string> {
    return this.publicUrl(key);
  }
}
