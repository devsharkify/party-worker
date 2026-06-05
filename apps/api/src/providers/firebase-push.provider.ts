import { Injectable, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";
import type { PushProvider, PushMessage } from "./push.provider";
import { loadEnv } from "../config/env";

let appInitialized = false;

function ensureApp(): void {
  if (appInitialized) return;
  const env = loadEnv();
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is required when PUSH_PROVIDER=fcm");
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)),
  });
  appInitialized = true;
}

/** Production provider: sends real FCM pushes via firebase-admin SDK. */
@Injectable()
export class FirebasePushProvider implements PushProvider {
  private readonly log = new Logger("FirebasePushProvider");

  constructor() {
    const env = loadEnv();
    if (env.FCM_PROVIDER === "firebase") {
      try {
        ensureApp();
      } catch (err) {
        this.log.error("Firebase init failed", (err as Error).message);
      }
    }
  }

  async sendToTopic(topic: string, msg: PushMessage): Promise<void> {
    try {
      ensureApp();
      await admin.messaging().send({
        topic,
        notification: { title: msg.title, body: msg.body },
        data: msg.data ?? {},
      });
    } catch (err) {
      this.log.error(`sendToTopic(topic=${topic}) failed: ${(err as Error).message}`);
    }
  }

  async sendToUser(userId: string, msg: PushMessage): Promise<void> {
    // Fanout is handled at the service layer (PushService.pushToUser) which
    // looks up device tokens and calls sendMulticast.  This method provides a
    // convenience path for callers that only know the userId and don't need the
    // per-token upsert/cleanup logic.
    this.log.log(`sendToUser(userId=${userId}) — no-op without token lookup; use PushService`);
  }

  /**
   * Send a notification to an explicit list of device tokens.
   * Uses sendEachForMulticast so individual failures don't abort the batch.
   */
  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (tokens.length === 0) return;
    try {
      ensureApp();
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data ?? {},
      });
      if (response.failureCount > 0) {
        this.log.warn(
          `sendMulticast: ${response.failureCount}/${tokens.length} tokens failed`,
        );
      }
    } catch (err) {
      this.log.error(`sendMulticast failed: ${(err as Error).message}`);
    }
  }
}
