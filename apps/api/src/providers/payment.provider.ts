import { Injectable, Logger } from "@nestjs/common";

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface CreateOrderResult {
  orderId: string;
  amountInr: number;
}

export interface VerifyResult {
  success: boolean;
  ref: string;
}

export interface PaymentProvider {
  createOrder(input: { userId: string; amountInr: number }): Promise<CreateOrderResult>;
  verify(input: { orderId: string; signature?: string }): Promise<VerifyResult>;
}

/** Dev provider: auto-approves the UPI membership payment. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly log = new Logger("MockPaymentProvider");

  async createOrder(input: { userId: string; amountInr: number }): Promise<CreateOrderResult> {
    const orderId = `mock_order_${Date.now()}`;
    this.log.log(`create UPI order ${orderId} for ${input.userId} ₹${input.amountInr}`);
    return { orderId, amountInr: input.amountInr };
  }

  async verify(input: { orderId: string; signature?: string }): Promise<VerifyResult> {
    this.log.log(`auto-approve ${input.orderId}`);
    return { success: true, ref: `mock_pay_${input.orderId}` };
  }
}
