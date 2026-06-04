import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../providers/payment.provider";
import { APP_ENV, type Env } from "../config/env";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly payment: PaymentProvider,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async startMembership(userId: string, amountInr?: number) {
    const amount = amountInr ?? this.env.MEMBERSHIP_FEE_INR;
    const order = await this.payment.createOrder({ userId, amountInr: amount });
    await this.prisma.payment.create({
      data: {
        userId,
        amountInr: amount,
        status: "created",
        provider: this.env.PAYMENT_PROVIDER,
        providerRef: order.orderId,
      },
    });
    return { orderId: order.orderId, amountInr: amount, status: "created" as const };
  }

  async verifyMembership(userId: string, orderId: string, signature?: string) {
    const pay = await this.prisma.payment.findFirst({ where: { userId, providerRef: orderId } });
    if (!pay) throw new NotFoundException("Payment order not found");

    const result = await this.payment.verify({ orderId, signature });
    if (result.success) {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: pay.id },
          data: { status: "success", paidAt: new Date() },
        }),
        this.prisma.user.update({ where: { id: userId }, data: { membershipActive: true } }),
      ]);
    } else {
      await this.prisma.payment.update({ where: { id: pay.id }, data: { status: "failed" } });
    }
    return { success: result.success, membershipActive: result.success, ref: result.ref };
  }
}
