import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshSchema,
  type AuthResult,
  type UserPublic,
} from "@pw/shared";
import { z } from "zod";
import { APP_ENV, type Env } from "../config/env";
import { Inject } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RateLimit, RateLimitGuard } from "./rate-limit.guard";
import { CurrentUser } from "./current-user.decorator";
import { REFRESH_COOKIE, type AuthUser } from "./auth.types";

type VerifyBody = z.output<typeof verifyOtpSchema>;
type RequestOtpBody = z.output<typeof requestOtpSchema>;
type RefreshBody = z.output<typeof refreshSchema>;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private setRefreshCookie(reply: FastifyReply, token: string): void {
    (reply as any).setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: this.env.COOKIE_DOMAIN,
      maxAge: this.env.JWT_REFRESH_TTL,
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    (reply as any).clearCookie(REFRESH_COOKIE, { path: "/", domain: this.env.COOKIE_DOMAIN });
  }

  @Post("request-otp")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 8, windowMs: 10 * 60_000 })
  async requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) dto: RequestOtpBody) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post("verify-otp")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 8, windowMs: 10 * 60_000 })
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResult> {
    const { accessToken, refreshToken, userId } = await this.auth.verifyOtp(dto.phone, dto.code);
    const user = await this.users.toPublic(userId);

    if (dto.client === "native") {
      return { accessToken, refreshToken, user };
    }
    // web: refresh token lives in an httpOnly cookie, never in JS
    this.setRefreshCookie(reply, refreshToken);
    return { accessToken, user };
  }

  @Post("refresh")
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResult> {
    const cookieToken = (req as any).cookies?.[REFRESH_COOKIE] as string | undefined;
    const fromCookie = Boolean(cookieToken);
    const token = cookieToken ?? dto.refreshToken;

    const { accessToken, refreshToken, userId } = await this.auth.refresh(token);
    const user = await this.users.toPublic(userId);

    if (fromCookie) {
      this.setRefreshCookie(reply, refreshToken);
      return { accessToken, user };
    }
    return { accessToken, refreshToken, user };
  }

  @Post("logout")
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookieToken = (req as any).cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(cookieToken ?? dto.refreshToken);
    this.clearRefreshCookie(reply);
    return { ok: true };
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser): Promise<UserPublic> {
    return this.users.toPublic(user.id);
  }
}
