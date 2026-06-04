import { Inject, Injectable } from "@nestjs/common";
import {
  computeSharePoints,
  type SocialAccountInfo,
  type SocialAccountType,
  type SocialPlatform,
} from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { INSTAGRAM_PROVIDER, type InstagramProvider } from "../providers/posting.provider";

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    @Inject(INSTAGRAM_PROVIDER) private readonly ig: InstagramProvider,
  ) {}

  async list(userId: string): Promise<SocialAccountInfo[]> {
    const accounts = await this.prisma.socialAccount.findMany({ where: { userId } });
    return accounts.map((a) => ({
      platform: a.platform as SocialPlatform,
      type: a.type as SocialAccountType,
      connected: a.connected,
      handle: a.handle,
      insightsAvailable: a.connected && a.type !== "personal",
    }));
  }

  /** Mock OAuth connect. Real impl redirects to Meta and exchanges the code. */
  async connectInstagram(
    userId: string,
    type: SocialAccountType = "creator",
    handle?: string,
  ): Promise<SocialAccountInfo> {
    const connected = type !== "personal";
    const resolvedHandle = handle ?? `worker_${userId.slice(-5)}`;
    const a = await this.prisma.socialAccount.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: {
        userId,
        platform: "instagram",
        type,
        connected,
        handle: connected ? resolvedHandle : null,
        accessTokenEnc: connected ? "mock-encrypted-oauth-token" : null,
      },
      update: {
        type,
        connected,
        handle: connected ? resolvedHandle : null,
        accessTokenEnc: connected ? "mock-encrypted-oauth-token" : null,
      },
    });
    return {
      platform: "instagram",
      type: a.type as SocialAccountType,
      connected: a.connected,
      handle: a.handle,
      insightsAvailable: a.connected && a.type !== "personal",
    };
  }

  async disconnectInstagram(userId: string): Promise<SocialAccountInfo> {
    return this.connectInstagram(userId, "personal");
  }

  /**
   * Pull insights for a connected Creator/Business account and award reach-weighted
   * points from REAL Instagram numbers. Personal/unconnected accounts get base only.
   */
  async syncInstagram(
    userId: string,
  ): Promise<{ synced: boolean; reason?: string; awarded: number; posts: number }> {
    const acct = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram" },
    });
    if (!acct || !acct.connected || acct.type === "personal") {
      return {
        synced: false,
        reason:
          "Personal/unconnected Instagram earns base points only. Switch to a Creator account and connect to earn full Instagram points.",
        awarded: 0,
        posts: 0,
      };
    }

    const shares = await this.prisma.shareEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    let awarded = 0;
    for (const s of shares) {
      const mediaId = `ig_${s.id}`;
      const insights = await this.ig.getInsights({ mediaId, accessToken: acct.accessTokenEnc ?? undefined });
      const existing = await this.prisma.reachEvent.findUnique({
        where: { shareEventId_source: { shareEventId: s.id, source: "instagram_insights" } },
      });
      const reachEvent = await this.prisma.reachEvent.upsert({
        where: { shareEventId_source: { shareEventId: s.id, source: "instagram_insights" } },
        create: {
          shareEventId: s.id,
          igMediaId: mediaId,
          source: "instagram_insights",
          uniqueCount: insights.reach,
          views: insights.views,
          likes: insights.likes,
          comments: insights.comments,
        },
        update: {
          uniqueCount: insights.reach,
          views: insights.views,
          likes: insights.likes,
          comments: insights.comments,
        },
      });
      const target = Math.round(computeSharePoints(reachEvent.uniqueCount));
      const prevAwarded = existing?.awardedPoints ?? 0;
      const delta = target - prevAwarded;
      if (delta > 0) {
        await this.scoring.award(userId, "share", delta, { instagram: true, shareEventId: s.id });
        await this.prisma.reachEvent.update({
          where: { id: reachEvent.id },
          data: { awardedPoints: target },
        });
        awarded += delta;
      }
    }

    return { synced: true, awarded, posts: shares.length };
  }
}
