import { Injectable, Logger } from "@nestjs/common";
import type { PushMessage, PushProvider } from "./push.provider";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo's documented max messages per request. */
const BATCH = 100;

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Production provider for Expo-managed apps: the client registers tokens via
 * expo-notifications getExpoPushTokenAsync(), and we deliver through Expo's
 * push HTTP API (which fans out to FCM/APNs). Hand-rolled fetch — no SDK dep.
 * Requires no server credentials; FCM credentials live in the EAS project.
 */
@Injectable()
export class ExpoPushProvider implements PushProvider {
  private readonly log = new Logger("ExpoPushProvider");

  async sendToTokens(tokens: string[], msg: PushMessage): Promise<string[]> {
    // Only Expo-format tokens can go through this pipe.
    const expoTokens = tokens.filter((t) => /^Expo(nent)?PushToken\[/.test(t));
    const skipped = tokens.length - expoTokens.length;
    if (skipped > 0) this.log.warn(`sendToTokens: skipped ${skipped} non-Expo token(s)`);
    if (expoTokens.length === 0) return [];

    const invalid: string[] = [];
    for (let i = 0; i < expoTokens.length; i += BATCH) {
      const chunk = expoTokens.slice(i, i + BATCH);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(
            chunk.map((to) => ({
              to,
              title: msg.title,
              body: msg.body,
              data: msg.data ?? {},
              sound: "default",
              priority: "high",
            })),
          ),
        });
        if (!res.ok) {
          this.log.error(`Expo push HTTP ${res.status}: ${await res.text().catch(() => "")}`);
          continue;
        }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        json.data?.forEach((ticket, idx) => {
          if (ticket.status === "error") {
            if (ticket.details?.error === "DeviceNotRegistered") {
              invalid.push(chunk[idx]!);
            } else {
              this.log.warn(`Expo push ticket error: ${ticket.details?.error ?? ticket.message}`);
            }
          }
        });
      } catch (err) {
        // Delivery is best-effort — a network blip must never break the caller.
        this.log.error(`Expo push batch failed: ${(err as Error).message}`);
      }
    }
    if (invalid.length > 0) {
      this.log.log(`sendToTokens: ${invalid.length} token(s) no longer registered`);
    }
    return invalid;
  }
}
