import { Body, Controller, Delete, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
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

const publishSchema = z.object({
  creativeId: z.string().min(1),
  kind: z.enum(["feed", "story", "reel"]).default("feed"),
  /** Optional override: URL of a pre-composited image (e.g. creative + worker banner). */
  mediaUrl: z.string().url().optional(),
  /** Optional: which connected account to post from. Defaults to primary. */
  socialAccountId: z.string().optional(),
});

const disconnectSchema = z.object({
  socialAccountId: z.string().min(1),
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

  /** Alias: GET /social/accounts */
  @Get("accounts")
  listAccounts(@CurrentUser() user: AuthUser) {
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

  /** Alias: POST /social/ig/connect */
  @Post("ig/connect")
  connectIg(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(connectSchema))
    dto: { type: z.infer<typeof SocialAccountType>; handle?: string },
  ) {
    return this.social.connectInstagram(user.id, dto.type, dto.handle);
  }

  @Post("instagram/disconnect")
  disconnect(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(disconnectSchema)) dto: { socialAccountId: string },
  ) {
    return this.social.disconnectInstagram(user.id, dto.socialAccountId);
  }

  /** Alias: DELETE /social/ig/disconnect */
  @Delete("ig/disconnect")
  disconnectIg(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(disconnectSchema)) dto: { socialAccountId: string },
  ) {
    return this.social.disconnectInstagram(user.id, dto.socialAccountId);
  }

  @Post("instagram/publish")
  publish(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(publishSchema))
    dto: { creativeId: string; kind: "feed" | "story" | "reel"; mediaUrl?: string; socialAccountId?: string },
  ) {
    return this.social.publishToInstagram(user.id, dto.creativeId, dto.kind, dto.mediaUrl, dto.socialAccountId);
  }

  @Post("instagram/sync")
  sync(@CurrentUser() user: AuthUser) {
    return this.social.syncInstagram(user.id);
  }

  /** Postiz mode: after worker returns from Instagram OAuth, map their channel to this worker. */
  @Post("postiz/finalize")
  finalizePostiz(@CurrentUser() user: AuthUser) {
    return this.social.finalizePostizConnect(user.id);
  }
}

/**
 * Public Meta OAuth redirect target (no JWT — the user arrives here from Meta).
 * The signed `state` carries the worker id; we exchange the code and redirect back.
 */
@ApiTags("social")
@Controller("social/instagram")
export class SocialOAuthController {
  constructor(private readonly social: SocialService) {}

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() _req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!code || !state) {
      reply.code(400).send("Missing code/state");
      return;
    }
    const { redirectUrl } = await this.social.handleOAuthCallback(code, state);
    reply.redirect(redirectUrl);
  }
}

