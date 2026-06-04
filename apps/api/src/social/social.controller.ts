import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SocialAccountType } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SocialService } from "./social.service";

const connectSchema = z.object({
  type: SocialAccountType.default("creator"),
  handle: z.string().optional(),
});

@ApiTags("social")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("social")
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.social.list(user.id);
  }

  @Post("instagram/connect")
  connect(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(connectSchema))
    dto: { type: z.infer<typeof SocialAccountType>; handle?: string },
  ) {
    return this.social.connectInstagram(user.id, dto.type, dto.handle);
  }

  @Post("instagram/disconnect")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.social.disconnectInstagram(user.id);
  }

  @Post("instagram/sync")
  sync(@CurrentUser() user: AuthUser) {
    return this.social.syncInstagram(user.id);
  }
}
