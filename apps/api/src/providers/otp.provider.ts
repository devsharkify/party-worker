import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env";

export const OTP_PROVIDER = Symbol("OTP_PROVIDER");

export interface OtpProvider {
  /** Deliver the verification code to the phone. */
  send(phone: string, code: string): Promise<void>;
}

/** Dev provider: never sends an SMS, just logs. Code is fixed via DEV_OTP_CODE. */
@Injectable()
export class FakeOtpProvider implements OtpProvider {
  private readonly log = new Logger("FakeOtpProvider");
  async send(phone: string, code: string): Promise<void> {
    this.log.log(`OTP for ${phone} = ${code}  (dev provider, no SMS sent)`);
  }
}

/**
 * Authkey.io SMS provider. Sends our generated code as the {#otp#} variable of a
 * pre-approved template (SID). Endpoint: GET https://api.authkey.io/request.
 */
@Injectable()
export class AuthkeyOtpProvider implements OtpProvider {
  private readonly log = new Logger("AuthkeyOtpProvider");
  private readonly env = loadEnv();

  async send(phone: string, code: string): Promise<void> {
    if (!this.env.AUTHKEY_API_KEY) {
      throw new Error("AUTHKEY_API_KEY is not configured");
    }
    const mobile = phone.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10);
    const url = new URL("https://api.authkey.io/request");
    url.searchParams.set("authkey", this.env.AUTHKEY_API_KEY);
    url.searchParams.set("mobile", mobile);
    url.searchParams.set("country_code", this.env.AUTHKEY_COUNTRY_CODE);
    url.searchParams.set("sid", this.env.AUTHKEY_SID);
    url.searchParams.set("otp", code);
    url.searchParams.set("company", this.env.AUTHKEY_COMPANY);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      const text = await res.text();
      if (!res.ok || !/Submitted/i.test(text)) {
        this.log.error(`Authkey send failed (${res.status}): ${text.slice(0, 200)}`);
        throw new Error("Failed to send OTP SMS. Please try again.");
      }
      this.log.log(`OTP SMS submitted to ${mobile}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("SMS service timed out");
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
