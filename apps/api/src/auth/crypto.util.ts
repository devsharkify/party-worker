import { createHash, randomUUID } from "node:crypto";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export const newId = (): string => randomUUID();

/** 6-digit numeric OTP for real providers (dev uses the fixed DEV_OTP_CODE). */
export const genOtpCode = (): string => String(Math.floor(100000 + Math.random() * 900000));
