import { Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PushService } from "./push.service";

const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

const removeTokenSchema = z.object({
  token: z.string().min(1),
});

type RegisterTokenDto = z.output<typeof registerTokenSchema>;
type RemoveTokenDto = z.output<typeof removeTokenSchema>;

@ApiTags("push")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("push")
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post("token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(registerTokenSchema)) dto: RegisterTokenDto,
  ): Promise<void> {
    await this.pushService.registerToken(user.id, dto.token, dto.platform);
  }

  @Delete("token")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(removeTokenSchema)) dto: RemoveTokenDto,
  ): Promise<void> {
    await this.pushService.removeToken(user.id, dto.token);
  }
}
