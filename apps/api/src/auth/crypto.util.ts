import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export const newId = (): string => randomUUID();

/** 6-digit numeric OTP for real providers (dev uses the fixed DEV_OTP_CODE). */
export const genOtpCode = (): string => String(Math.floor(100000 + Math.random() * 900000));

const keyFrom = (secret: string): Buffer => createHash("sha256").update(secret).digest();

/** AES-256-GCM encrypt a secret (e.g. an OAuth token) at rest. Returns iv:tag:ct (base64). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Reverse of encryptSecret. Throws if the ciphertext or auth tag is invalid. */
export function decryptSecret(enc: string, secret: string): string {
  const [ivB, tagB, ctB] = enc.split(":");
  if (!ivB || !tagB || !ctB) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
