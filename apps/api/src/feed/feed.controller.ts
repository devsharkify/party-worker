import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DeviceTier } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FeedService } from "./feed.service";

const reportRenderBody = z.object({
  deviceTier: DeviceTier,
  dataUrl: z.string().optional(),
  videoDataUrl: z.string().optional(),
  usedServerFallback: z.boolean().default(false),
});

const renderVideoBody = z.object({
  bannerKey: z.string().min(1),
});

@ApiTags("feed")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("feed")
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.feed.getFeed(user.id);
  }

  @Get(":creativeId")
  async item(@CurrentUser() user: AuthUser, @Param("creativeId") creativeId: string) {
    const item = await this.feed.getItem(user.id, creativeId);
    if (!item) throw new NotFoundException("Creative not in your feed");
    return item;
  }

  @Get("renders/mine")
  myRenders(@CurrentUser() user: AuthUser) {
    return this.feed.getMyRenders(user.id);
  }

  @Post(":creativeId/render")
  report(
    @CurrentUser() user: AuthUser,
    @Param("creativeId") creativeId: string,
    @Body(new ZodValidationPipe(reportRenderBody))
    dto: { deviceTier: z.infer<typeof DeviceTier>; dataUrl?: string; videoDataUrl?: string; usedServerFallback: boolean },
  ) {
    return this.feed.reportRender(user.id, creativeId, dto);
  }

  /**
   * Server-side video banner overlay (native can't composite video on-device).
   * Client uploads the banner PNG via /creatives/upload, then sends its key here.
   */
  @Post(":creativeId/render-video")
  renderVideo(
    @CurrentUser() user: AuthUser,
    @Param("creativeId") creativeId: string,
    @Body(new ZodValidationPipe(renderVideoBody)) dto: { bannerKey: string },
  ) {
    return this.feed.renderPersonalizedVideo(user.id, creativeId, dto.bannerKey);
  }
}
