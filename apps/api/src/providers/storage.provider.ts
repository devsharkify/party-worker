import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env";

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export interface PutResult {
  key: string;
  url: string;
}

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<PutResult>;
  publicUrl(key: string): string;
  /** Real impls return a short-lived signed URL; dev serves the public URL. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

/** Dev provider: writes to local disk under STORAGE_LOCAL_DIR, served at /media/*. */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly env = loadEnv();
  private readonly root = join(process.cwd(), this.env.STORAGE_LOCAL_DIR);

  async put(key: string, data: Buffer, _contentType: string): Promise<PutResult> {
    const dest = join(this.root, key);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${this.env.STORAGE_PUBLIC_BASE}/${key}`;
  }

  async signedUrl(key: string, _ttlSeconds?: number): Promise<string> {
    return this.publicUrl(key);
  }
}
