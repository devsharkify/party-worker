import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env";
import type { OtpProvider } from "./otp.provider";

/**
 * Meta WhatsApp Business Cloud API OTP provider.
 *
 * Sends the OTP code via a pre-approved WhatsApp message template named
 * `otp_verification`.  The template must have a body component with a single
 * variable `{{1}}` which is substituted with the code at send time.
 *
 * Required env vars (set when OTP_PROVIDER=whatsapp):
 *   WHATSAPP_ACCESS_TOKEN      — permanent or temporary Bearer token for the
 *                                Meta Graph API (System User token recommended)
 *   WHATSAPP_PHONE_NUMBER_ID   — the numeric Phone Number ID from the Meta
 *                                WhatsApp Business dashboard
 *
 * API reference:
 *   POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages
 */
@Injectable()
export class WhatsAppOtpProvider implements OtpProvider {
  private readonly log = new Logger("WhatsAppOtpProvider");
  private readonly env = loadEnv();

  async send(phone: string, code: string): Promise<void> {
    if (!this.env.WHATSAPP_ACCESS_TOKEN || !this.env.WHATSAPP_PHONE_NUMBER_ID) {
      this.log.error(
        "WhatsApp OTP send skipped: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured",
      );
      return;
    }

    // Normalise to E.164 without leading '+' — WhatsApp expects the number with
    // country code but no plus sign (e.g. "919876543210").
    const to = phone.replace(/^\+/, "").replace(/\D/g, "");

    const url = `https://graph.facebook.com/v20.0/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "otp_verification",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: code }],
          },
        ],
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        this.log.error(
          `WhatsApp OTP send failed (${res.status}): ${text.slice(0, 300)}`,
        );
        return;
      }

      this.log.log(`WhatsApp OTP sent to ${to}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        this.log.error("WhatsApp OTP send timed out after 15 s");
        return;
      }
      this.log.error(`WhatsApp OTP send error: ${(e as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
