// Razorpay REST API directly — no SDK to keep dependencies lean.
// Auth: HTTP Basic with key_id:key_secret (Base64 encoded).
// Set PAYMENT_PROVIDER=razorpay and provide RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.

import * as crypto from "crypto";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";
import type { CreateOrderResult, PaymentProvider, VerifyResult } from "./payment.provider";

@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  private readonly log = new Logger("RazorpayPaymentProvider");

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private get authHeader(): string {
    const keyId = this.env.RAZORPAY_KEY_ID ?? "";
    const keySecret = this.env.RAZORPAY_KEY_SECRET ?? "";
    const encoded = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    return `Basic ${encoded}`;
  }

  private async razorpayFetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `https://api.razorpay.com/v1${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      let message = `Razorpay API error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { description?: string } };
        message = body?.error?.description ?? message;
      } catch {
        // ignore parse error
      }
      this.log.error(message);
      throw new BadRequestException(message);
    }

    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // PaymentProvider interface
  // ---------------------------------------------------------------------------

  async createOrder(input: { userId: string; amountInr: number }): Promise<CreateOrderResult> {
    this.log.log(`createOrder for user=${input.userId} amount=₹${input.amountInr}`);

    const order = await this.razorpayFetch<{ id: string; amount: number }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        // Razorpay expects paise (1 INR = 100 paise)
        amount: Math.round(input.amountInr * 100),
        currency: "INR",
        receipt: input.userId,
      }),
    });

    this.log.log(`order created: ${order.id}`);
    return { orderId: order.id, amountInr: input.amountInr };
  }

  async verify(input: { orderId: string; signature?: string }): Promise<VerifyResult> {
    const { orderId, signature } = input;

    // --- HMAC path: client provides signature from Razorpay checkout ---
    // The client sends signature as a JSON string:
    //   { "paymentId": "pay_xxx", "razorpaySignature": "<hmac>" }
    // Razorpay signs the string "${razorpay_order_id}|${razorpay_payment_id}"
    // with HMAC-SHA256 using the key_secret.
    if (signature) {
      let paymentId: string;
      let razorpaySignature: string;

      try {
        const parsed = JSON.parse(signature) as { paymentId: string; razorpaySignature: string };
        paymentId = parsed.paymentId;
        razorpaySignature = parsed.razorpaySignature;
      } catch {
        this.log.error("Failed to parse signature JSON");
        throw new BadRequestException("Invalid signature format");
      }

      const keySecret = this.env.RAZORPAY_KEY_SECRET ?? "";
      const expectedHmac = crypto
        .createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedHmac, "hex"),
        Buffer.from(razorpaySignature, "hex"),
      );

      this.log.log(`HMAC verify orderId=${orderId} paymentId=${paymentId} valid=${valid}`);
      return { success: valid, ref: paymentId };
    }

    // --- Polling path: no signature, check order status via REST ---
    this.log.log(`polling order status for orderId=${orderId}`);
    const order = await this.razorpayFetch<{ id: string; status: string }>(`/orders/${orderId}`);
    const success = order.status === "paid";
    this.log.log(`order ${orderId} status=${order.status}`);
    return { success, ref: orderId };
  }
}
