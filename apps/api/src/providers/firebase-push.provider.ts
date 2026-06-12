import { Injectable, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";
import type { PushProvider, PushMessage } from "./push.provider";
import { loadEnv } from "../config/env";

let appInitialized = false;

function ensureApp(): void {
  if (appInitialized) return;
  const env = loadEnv();
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is required when PUSH_PROVIDER=firebase");
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)),
  });
  appInitialized = true;
}

function usesFirebase(env: ReturnType<typeof loadEnv>): boolean {
  return (
    env.PUSH_PROVIDER === "firebase" ||
    env.PUSH_PROVIDER === "fcm" ||
    env.FCM_PROVIDER === "firebase"
  );
}

/** Tokens with these error codes are permanently dead and should be pruned. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/**
 * Direct-FCM provider for clients that register RAW FCM device tokens
 * (getDevicePushTokenAsync). The app currently registers Expo tokens, so the
 * default production provider is ExpoPushProvider; this stays available for a
 * future bare-workflow migration via PUSH_PROVIDER=firebase.
 */
@Injectable()
export class FirebasePushProvider implements PushProvider {
  private readonly log = new Logger("FirebasePushProvider");

  constructor() {
    const env = loadEnv();
    if (usesFirebase(env)) {
      try {
        ensureApp();
      } catch (err) {
        this.log.error("Firebase init failed", (err as Error).message);
      }
    }
  }

  /**
   * Send to explicit FCM tokens via sendEachForMulticast (individual failures
   * don't abort the batch). Returns permanently-invalid tokens for pruning.
   */
  async sendToTokens(tokens: string[], msg: PushMessage): Promise<string[]> {
    if (tokens.length === 0) return [];
    const invalid: string[] = [];
    try {
      ensureApp();
      // FCM allows max 500 tokens per sendEachForMulticast call.
      const CHUNK = 500;
      for (let i = 0; i < tokens.length; i += CHUNK) {
        const chunk = tokens.slice(i, i + CHUNK);
        const response = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title: msg.title, body: msg.body },
          data: msg.data ?? {},
        });
        response.responses.forEach((r, idx) => {
          if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
            invalid.push(chunk[idx]!);
          }
        });
        if (response.failureCount > 0) {
          this.log.warn(`sendToTokens: ${response.failureCount}/${chunk.length} tokens failed`);
        }
      }
    } catch (err) {
      this.log.error(`sendToTokens failed: ${(err as Error).message}`);
    }
    return invalid;
  }
}
