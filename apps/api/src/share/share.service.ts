import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import {
  SCORING,
  type CaptionVariants,
  type ShareChannel,
  type ShareConfirmResult,
  type ShareResult,
} from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { ASSISTED_SHARE, type AssistedShareProvider } from "../providers/posting.provider";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import { APP_ENV, type Env } from "../config/env";

export type ShareResponse = ShareResult & { deepLinks: Record<string, string> };

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    @Inject(ASSISTED_SHARE) private readonly assisted: AssistedShareProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private captionFor(variants: unknown, lang: string): string {
    const cv = (variants ?? {}) as CaptionVariants;
    return cv[lang as keyof CaptionVariants] ?? cv.te ?? cv.en ?? "";
  }

  private mediaUrl(key: string): string {
    return /^https?:\/\//.test(key) ? key : this.storage.publicUrl(key);
  }

  /**
   * Prepare a share: one tracked "post" per (worker, creative). Creates the
   * ShareEvent + tracked link but awards NO points — points are credited only
   * when the worker actually shares (confirm below).
   */
  async share(userId: string, creativeId: string, channel?: ShareChannel): Promise<ShareResponse> {
    const creative = await this.prisma.creative.findUniqueOrThrow({ where: { id: creativeId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let share = await this.prisma.shareEvent.findFirst({ where: { userId, creativeId } });

    if (!share) {
      const trackedLinkId = `${userId.slice(-6)}-${creativeId.slice(-6)}-${nanoid(6)}`;
      share = await this.prisma.shareEvent.create({
        data: {
          userId,
          creativeId,
          channel: channel ?? "whatsapp_status",
          trackedLinkId,
          basePointsAwarded: 0,
        },
      });
    }

    const render = await this.prisma.personalizedRender.findFirst({
      where: { userId, creativeId },
    });

    const trackedLink = `${this.env.PUBLIC_LINK_BASE}/r/${share.trackedLinkId}`;
    const baseCaption = this.captionFor(creative.captionVariants, user.preferredLanguage);
    const caption = `${baseCaption}\n\n${trackedLink}`;
    const mediaUrl = this.mediaUrl(creative.sourceKey);
    const deepLinks = this.assisted.buildDeepLinks({
      caption,
      mediaUrl: render?.cachedUrl ?? mediaUrl,
      channel: channel ?? "whatsapp_status",
    });

    return {
      shareEventId: share.id,
      trackedLink,
      caption,
      basePointsAwarded: share.basePointsAwarded,
      personalizedUrl: render?.cachedUrl ?? null,
      mediaUrl,
      deepLinks,
    };
  }

  /**
   * The worker actually shared (share sheet completed / channel opened).
   * Records the real channel and credits the base point exactly once per
   * (worker, creative) — repeat shares update the channel but award 0.
   */
  async confirm(userId: string, shareEventId: string, channel: ShareChannel): Promise<ShareConfirmResult> {
    const share = await this.prisma.shareEvent.findUniqueOrThrow({ where: { id: shareEventId } });
    if (share.userId !== userId) throw new ForbiddenException("Not your share");

    if (share.basePointsAwarded > 0) {
      await this.prisma.shareEvent.update({
        where: { id: share.id },
        data: { channel, shareIntentAt: new Date() },
      });
      return { pointsAwarded: 0 };
    }

    await this.prisma.shareEvent.update({
      where: { id: share.id },
      data: { channel, shareIntentAt: new Date(), basePointsAwarded: SCORING.SHARE_BASE },
    });
    await this.scoring.award(userId, "share", SCORING.SHARE_BASE, { shareEventId: share.id, channel });
    return { pointsAwarded: SCORING.SHARE_BASE };
  }
}
