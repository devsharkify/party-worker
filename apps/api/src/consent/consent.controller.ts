import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ConsentPurpose } from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ConsentService } from "./consent.service";

/** Local body schema for setting a single consent (reuses the shared purpose enum). */
const setConsentSchema = z.object({
  purpose: ConsentPurpose,
  granted: z.boolean(),
});
type SetConsentDto = z.infer<typeof setConsentSchema>;

@ApiTags("consent")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("me/consents")
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  /** All four DPDP purposes with the current user's state (default granted=false). */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.consent.listForUser(user.id);
  }

  /** Grant or revoke a single consent purpose for the current user. */
  @Post()
  set(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setConsentSchema)) dto: SetConsentDto,
  ) {
    return this.consent.set(user.id, dto.purpose, dto.granted);
  }
}
