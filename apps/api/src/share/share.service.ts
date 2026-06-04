import { Inject, Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import {
  SCORING,
  type CaptionVariants,
  type ShareChannel,
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
   * Record a share intent. One tracked "post" per (worker, creative): the base
   * point is awarded once; reach taps then drive it up to the cap.
   */
  async share(userId: string, creativeId: string, channel: ShareChannel): Promise<ShareResponse> {
    const creative = await this.prisma.creative.findUniqueOrThrow({ where: { id: creativeId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let share = await this.prisma.shareEvent.findFirst({ where: { userId, creativeId } });
    let basePointsAwarded = 0;

    if (!share) {
      const trackedLinkId = `${userId.slice(-6)}-${creativeId.slice(-6)}-${nanoid(6)}`;
      share = await this.prisma.shareEvent.create({
        data: { userId, creativeId, channel, trackedLinkId, basePointsAwarded: SCORING.SHARE_BASE },
      });
      await this.scoring.award(userId, "share", SCORING.SHARE_BASE, { shareEventId: share.id, channel });
      basePointsAwarded = SCORING.SHARE_BASE;
    } else {
      await this.prisma.shareEvent.update({
        where: { id: share.id },
        data: { channel, shareIntentAt: new Date() },
      });
    }

    const trackedLink = `${this.env.PUBLIC_LINK_BASE}/r/${share.trackedLinkId}`;
    const baseCaption = this.captionFor(creative.captionVariants, user.preferredLanguage);
    const caption = `${baseCaption}\n\n${trackedLink}`;
    const deepLinks = this.assisted.buildDeepLinks({
      caption,
      mediaUrl: this.mediaUrl(creative.sourceKey),
      channel,
    });

    return { shareEventId: share.id, trackedLink, caption, basePointsAwarded, deepLinks };
  }
}
