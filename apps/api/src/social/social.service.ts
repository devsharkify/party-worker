import { ForbiddenException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  computeSharePoints,
  type CaptionVariants,
  type SocialAccountInfo,
  type SocialAccountType,
  type SocialPlatform,
} from "@pw/shared";
import { APP_ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { INSTAGRAM_PROVIDER, type InstagramProvider } from "../providers/posting.provider";
import { decryptSecret, encryptSecret, sha256 } from "../auth/crypto.util";

export type ConnectInstagramResult = SocialAccountInfo & {
  /** "mock" = instantly connected (dev). "graph" = open authorizeUrl to link via Meta. */
  mode: "mock" | "graph";
  authorizeUrl?: string;
};

interface SyncResult {
  synced: boolean;
  reason?: string;
  awarded: number;
  posts: number;
}

@Injectable()
export class SocialService {
  private readonly log = new Logger("SocialService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    @Inject(INSTAGRAM_PROVIDER) private readonly ig: InstagramProvider,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private get graphMode(): boolean {
    return this.env.INSTAGRAM_PROVIDER === "graph";
  }

  private get graphBase(): string {
    return `https://graph.facebook.com/${this.env.META_GRAPH_VERSION}`;
  }

  private toInfo(a: {
    platform: string;
    type: string;
    connected: boolean;
    handle: string | null;
  }): SocialAccountInfo {
    return {
      platform: a.platform as SocialPlatform,
      type: a.type as SocialAccountType,
      connected: a.connected,
      handle: a.handle,
      insightsAvailable: a.connected && a.type !== "personal",
    };
  }

  async list(userId: string): Promise<SocialAccountInfo[]> {
    const accounts = await this.prisma.socialAccount.findMany({ where: { userId } });
    return accounts.map((a) => this.toInfo(a));
  }

  /**
   * Mock mode: instantly connect (dev). Graph mode: return a Meta OAuth authorize
   * URL the client opens; linking completes in handleOAuthCallback.
   */
  async connectInstagram(
    userId: string,
    type: SocialAccountType = "creator",
    handle?: string,
  ): Promise<ConnectInstagramResult> {
    if (this.graphMode) {
      return {
        platform: "instagram",
        type: "creator",
        connected: false,
        handle: null,
        insightsAvailable: false,
        mode: "graph",
        authorizeUrl: this.getAuthorizeUrl(userId),
      };
    }

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
    return { ...this.toInfo(a), mode: "mock" };
  }

  async disconnectInstagram(userId: string): Promise<SocialAccountInfo> {
    const a = await this.prisma.socialAccount.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: { userId, platform: "instagram", type: "personal", connected: false },
      update: {
        type: "personal",
        connected: false,
        handle: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        remoteUserId: null,
        tokenExpiresAt: null,
      },
    });
    return this.toInfo(a);
  }

  // --- Meta OAuth (graph mode) -------------------------------------------------

  private signState(userId: string): string {
    const sig = sha256(`${userId}.${this.env.SOCIAL_TOKEN_ENC_KEY}`).slice(0, 24);
    return `${Buffer.from(userId).toString("base64url")}.${sig}`;
  }

  private verifyState(state: string): string | null {
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return null;
    const userId = Buffer.from(b64, "base64url").toString("utf8");
    return sha256(`${userId}.${this.env.SOCIAL_TOKEN_ENC_KEY}`).slice(0, 24) === sig ? userId : null;
  }

  getAuthorizeUrl(userId: string): string {
    const u = new URL(`https://www.facebook.com/${this.env.META_GRAPH_VERSION}/dialog/oauth`);
    u.searchParams.set("client_id", this.env.META_APP_ID);
    u.searchParams.set("redirect_uri", this.env.META_OAUTH_REDIRECT);
    u.searchParams.set("state", this.signState(userId));
    u.searchParams.set("scope", this.env.INSTAGRAM_SCOPES);
    u.searchParams.set("response_type", "code");
    return u.toString();
  }

  /** OAuth redirect handler: exchange code, discover the IG account, store the token. */
  async handleOAuthCallback(code: string, state: string): Promise<{ redirectUrl: string }> {
    const userId = this.verifyState(state);
    const fail = (msg: string) =>
      `${this.env.SOCIAL_CONNECT_RETURN_URL}?ig=error&reason=${encodeURIComponent(msg)}`;
    if (!userId) return { redirectUrl: fail("Invalid OAuth state") };

    try {
      const shortTok = await this.exchangeCode(code);
      const longTok = await this.exchangeLongLived(shortTok);
      const account = await this.discoverIgAccount(longTok.token);
      if (!account) return { redirectUrl: fail("No Instagram Business account linked to a Page") };

      await this.prisma.socialAccount.upsert({
        where: { userId_platform: { userId, platform: "instagram" } },
        create: {
          userId,
          platform: "instagram",
          type: "business",
          connected: true,
          handle: account.username,
          remoteUserId: account.igUserId,
          accessTokenEnc: encryptSecret(account.pageToken, this.env.SOCIAL_TOKEN_ENC_KEY),
          tokenExpiresAt: longTok.expiresAt,
        },
        update: {
          type: "business",
          connected: true,
          handle: account.username,
          remoteUserId: account.igUserId,
          accessTokenEnc: encryptSecret(account.pageToken, this.env.SOCIAL_TOKEN_ENC_KEY),
          tokenExpiresAt: longTok.expiresAt,
        },
      });
      return { redirectUrl: `${this.env.SOCIAL_CONNECT_RETURN_URL}?ig=connected` };
    } catch (e) {
      this.log.error(`IG OAuth callback failed: ${(e as Error).message}`);
      return { redirectUrl: fail((e as Error).message) };
    }
  }

  private async exchangeCode(code: string): Promise<string> {
    const u = new URL(`${this.graphBase}/oauth/access_token`);
    u.searchParams.set("client_id", this.env.META_APP_ID);
    u.searchParams.set("client_secret", this.env.META_APP_SECRET);
    u.searchParams.set("redirect_uri", this.env.META_OAUTH_REDIRECT);
    u.searchParams.set("code", code);
    const json = await this.fetchJson(u.toString());
    return json.access_token as string;
  }

  private async exchangeLongLived(shortToken: string): Promise<{ token: string; expiresAt: Date | null }> {
    const u = new URL(`${this.graphBase}/oauth/access_token`);
    u.searchParams.set("grant_type", "fb_exchange_token");
    u.searchParams.set("client_id", this.env.META_APP_ID);
    u.searchParams.set("client_secret", this.env.META_APP_SECRET);
    u.searchParams.set("fb_exchange_token", shortToken);
    const json = await this.fetchJson(u.toString());
    const expiresAt = json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000) : null;
    return { token: json.access_token as string, expiresAt };
  }

  private async discoverIgAccount(
    userToken: string,
  ): Promise<{ igUserId: string; username: string; pageToken: string } | null> {
    const u = new URL(`${this.graphBase}/me/accounts`);
    u.searchParams.set("fields", "access_token,instagram_business_account{id,username}");
    u.searchParams.set("access_token", userToken);
    const json = await this.fetchJson(u.toString());
    const page = (json.data ?? []).find((p: any) => p.instagram_business_account?.id);
    if (!page) return null;
    return {
      igUserId: String(page.instagram_business_account.id),
      username: String(page.instagram_business_account.username ?? "instagram"),
      pageToken: String(page.access_token),
    };
  }

  private async fetchJson(url: string): Promise<any> {
    const res = await fetch(url);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Graph request failed (${res.status})`);
    return json;
  }

  // --- Publishing + insights ---------------------------------------------------

  private tokenFor(acct: { accessTokenEnc: string | null }): string | undefined {
    if (!acct.accessTokenEnc) return undefined;
    if (!this.graphMode) return acct.accessTokenEnc; // mock token, used by MockInstagramProvider
    try {
      return decryptSecret(acct.accessTokenEnc, this.env.SOCIAL_TOKEN_ENC_KEY);
    } catch {
      return acct.accessTokenEnc;
    }
  }

  private captionFor(variants: unknown, lang: string): string {
    const cv = (variants ?? {}) as CaptionVariants;
    return cv[lang as keyof CaptionVariants] ?? cv.te ?? cv.en ?? "";
  }

  /** Publish a worker's personalized creative to their connected Instagram. */
  async publishToInstagram(
    userId: string,
    creativeId: string,
    kind: "feed" | "story" | "reel" = "feed",
    mediaUrlOverride?: string,
  ): Promise<{ published: boolean; remoteId: string }> {
    const acct = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram" },
    });
    if (!acct || !acct.connected || acct.type === "personal") {
      throw new ForbiddenException("Connect a Creator/Business Instagram account first.");
    }
    const creative = await this.prisma.creative.findUniqueOrThrow({ where: { id: creativeId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const render = await this.prisma.personalizedRender.findUnique({
      where: { userId_creativeId: { userId, creativeId } },
    });
    const mediaUrl = mediaUrlOverride ?? render?.cachedUrl ?? creative.sourceKey;

    const { remoteId } = await this.ig.publish({
      account: {
        handle: acct.handle ?? "",
        accessToken: this.tokenFor(acct),
        igUserId: acct.remoteUserId ?? undefined,
      },
      mediaUrl,
      caption: this.captionFor(creative.captionVariants, user.preferredLanguage),
      kind,
    });

    // Link the post to a ShareEvent so insights/reach can accrue to it.
    let share = await this.prisma.shareEvent.findFirst({ where: { userId, creativeId } });
    if (!share) {
      share = await this.prisma.shareEvent.create({
        data: {
          userId,
          creativeId,
          channel: "instagram_feed",
          trackedLinkId: `${userId.slice(-6)}-${creativeId.slice(-6)}-ig${Date.now().toString(36)}`,
          basePointsAwarded: 0,
        },
      });
    }
    await this.prisma.reachEvent.upsert({
      where: { shareEventId_source: { shareEventId: share.id, source: "instagram_insights" } },
      create: { shareEventId: share.id, igMediaId: remoteId, source: "instagram_insights", uniqueCount: 0 },
      update: { igMediaId: remoteId },
    });

    return { published: true, remoteId };
  }

  async syncInstagram(userId: string): Promise<SyncResult> {
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
    return this.graphMode ? this.syncGraph(userId, acct) : this.syncMock(userId, acct);
  }

  /** Graph mode: pull insights for media this worker actually published via the API. */
  private async syncGraph(
    userId: string,
    acct: { accessTokenEnc: string | null },
  ): Promise<SyncResult> {
    const token = this.tokenFor(acct);
    const events = await this.prisma.reachEvent.findMany({
      where: { source: "instagram_insights", shareEvent: { userId }, igMediaId: { not: null } },
      include: { shareEvent: true },
      take: 25,
    });
    let awarded = 0;
    for (const ev of events) {
      const insights = await this.ig
        .getInsights({ mediaId: ev.igMediaId!, accessToken: token })
        .catch((e) => {
          this.log.warn(`insights failed for ${ev.igMediaId}: ${(e as Error).message}`);
          return null;
        });
      if (!insights) continue;
      await this.prisma.reachEvent.update({
        where: { id: ev.id },
        data: {
          uniqueCount: insights.reach,
          views: insights.views,
          likes: insights.likes,
          comments: insights.comments,
        },
      });
      const target = Math.round(computeSharePoints(insights.reach));
      const delta = target - ev.awardedPoints;
      if (delta > 0) {
        await this.scoring.award(userId, "share", delta, {
          instagram: true,
          shareEventId: ev.shareEventId,
        });
        await this.prisma.reachEvent.update({ where: { id: ev.id }, data: { awardedPoints: target } });
        awarded += delta;
      }
    }
    return { synced: true, awarded, posts: events.length };
  }

  /** Dev mode: synthesize insights for the worker's recent shares (deterministic). */
  private async syncMock(
    userId: string,
    acct: { accessTokenEnc: string | null },
  ): Promise<SyncResult> {
    const shares = await this.prisma.shareEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    let awarded = 0;
    for (const s of shares) {
      const mediaId = `ig_${s.id}`;
      const insights = await this.ig.getInsights({
        mediaId,
        accessToken: acct.accessTokenEnc ?? undefined,
      });
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
