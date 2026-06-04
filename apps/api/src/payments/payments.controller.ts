import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { startMembershipSchema, type StartMembershipDto } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PaymentsService } from "./payments.service";

const verifySchema = z.object({ orderId: z.string(), signature: z.string().optional() });

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
    @Body(new ZodValidationPipe(verifySchema)) dto: { orderId: string; signature?: string },
  ) {
    return this.payments.verifyMembership(user.id, dto.orderId, dto.signature);
  }
}
