import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { startMembershipSchema, type StartMembershipDto } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PaymentsService } from "./payments.service";

// signature can be a plain string OR a Razorpay checkout object
// { paymentId: string; razorpaySignature: string }.
// When an object is provided it is serialized to JSON so the provider
// receives a consistent string type.
const signatureField = z
  .union([
    z.string(),
    z.object({ paymentId: z.string(), razorpaySignature: z.string() }),
  ])
  .optional();

const verifySchema = z.object({ orderId: z.string(), signature: signatureField });

type VerifyDto = {
  orderId: string;
  signature?: string | { paymentId: string; razorpaySignature: string };
};

@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("membership/start")
  start(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(startMembershipSchema)) dto: StartMembershipDto,
  ) {
    return this.payments.startMembership(user.id, dto.amountInr);
  }

  @Post("membership/verify")
  verify(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(verifySchema)) dto: VerifyDto,
  ) {
    // Normalize signature to a string so all providers receive a consistent type.
    const sig =
      dto.signature == null
        ? undefined
        : typeof dto.signature === "string"
          ? dto.signature
          : JSON.stringify(dto.signature);
    return this.payments.verifyMembership(user.id, dto.orderId, sig);
  }
}
