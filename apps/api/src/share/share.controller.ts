import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  shareConfirmSchema,
  shareIntentSchema,
  type ShareConfirmDto,
  type ShareIntentDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ShareService } from "./share.service";

@ApiTags("share")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("share")
export class ShareController {
  constructor(private readonly share: ShareService) {}

  /** Prepare the tracked link + caption + media. Awards no points. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(shareIntentSchema)) dto: ShareIntentDto,
  ) {
    return this.share.share(user.id, dto.creativeId, dto.channel);
  }

  /** The worker actually shared — record channel, credit base point once. */
  @Post("confirm")
  confirm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(shareConfirmSchema)) dto: ShareConfirmDto,
  ) {
    return this.share.confirm(user.id, dto.shareEventId, dto.channel);
  }
}
