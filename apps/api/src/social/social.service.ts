import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
  /** "mock" = instantly connected (dev). "graph" = direct Meta OAuth. "postiz" = via Postiz channel. */
  mode: "mock" | "graph" | "postiz";
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

  private get postizMode(): boolean {
    return this.env.INSTAGRAM_PROVIDER === "postiz";
  }

  private get postizBase(): string {
    return this.env.POSTIZ_BASE_URL.replace(/\/$/, "");
  }

  private get graphBase(): string {
    return `https://graph.facebook.com/${this.env.META_GRAPH_VERSION}`;
  }

  private toInfo(a: {
    id: string;
    platform: string;
    type: string;
    connected: boolean;
    handle: string | null;
    isPrimary: boolean;
  }): SocialAccountInfo {
    return {
      id: a.id,
      platform: a.platform as SocialPlatform,
      type: a.type as SocialAccountType,
      connected: a.connected,
      handle: a.handle,
      isPrimary: a.isPrimary,
      insightsAvailable: a.connected && a.type !== "personal",
    };
  }

  async list(userId: string): Promise<SocialAccountInfo[]> {
    const accounts = await this.prisma.socialAccount.findMany({ where: { userId, connected: true } });
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
        id: "",
        platform: "instagram",
        type: "creator",
        connected: false,
        handle: null,
        isPrimary: false,
        insightsAvailable: false,
        mode: "graph",
        authorizeUrl: this.getAuthorizeUrl(userId),
      };
    }

    if (this.postizMode) {
      // Remove stale pending rows so finalize always operates on exactly one.
      await this.prisma.socialAccount.deleteMany({ where: { userId, platform: "instagram", connected: false } });
      // Snapshot current integration IDs so finalize can identify the newly-added channel.
      const snapshot = await this.postizIntegrationIds();
      const existing = await this.prisma.socialAccount.count({ where: { userId, platform: "instagram", connected: true } });
      await this.prisma.socialAccount.create({
        data: { userId, platform: "instagram", type: "creator", connected: false, isPrimary: existing === 0, handle: null, accessTokenEnc: JSON.stringify(snapshot) },
      });
      const url = await this.postizConnectUrl();
      return { id: "", platform: "instagram", type: "creator", connected: false, handle: null, isPrimary: existing === 0, insightsAvailable: false, mode: "postiz", authorizeUrl: url };
    }

    const connected = type !== "personal";
    const resolvedHandle = handle ?? `worker_${userId.slice(-5)}`;
    const existing = await this.prisma.socialAccount.count({ where: { userId, platform: "instagram", connected: true } });
    const a = await this.prisma.socialAccount.create({
      data: {
        userId,
        platform: "instagram",
        type,
        connected,
        isPrimary: existing === 0 && connected,
        handle: connected ? resolvedHandle : null,
        accessTokenEnc: connected ? "mock-encrypted-oauth-token" : null,
      },
    });
    return { ...this.toInfo(a), mode: "mock" };
  }

  async disconnectInstagram(userId: string, accountId: string): Promise<{ id: string }> {
    const acct = await this.prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
    if (!acct) throw new NotFoundException("Social account not found.");
    await this.prisma.socialAccount.delete({ where: { id: accountId } });
    // If the deleted account was primary, promote the oldest remaining connected one.
    if (acct.isPrimary) {
      const next = await this.prisma.socialAccount.findFirst({ where: { userId, platform: "instagram", connected: true }, orderBy: { createdAt: "asc" } });
      if (next) await this.prisma.socialAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    return { id: accountId };
  }

  // --- Postiz org-level channel connect (postiz mode) -------------------------

  /** Fetch Instagram integration IDs currently in the org Postiz workspace. */
  private async postizIntegrationIds(): Promise<string[]> {
    try {
      const res = await fetch(`${this.postizBase}/integrations`, {
        headers: { Authorization: this.env.POSTIZ_API_KEY },
      });
      const list: any = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(list)) return [];
      // Snapshot only Instagram channels so the before/after diff is apples-to-apples.
      return list
        .filter((i: any) => {
          const id = String(i.identifier ?? "");
          return (id === "instagram" || id === "instagram_business" || id === "facebook_instagram") && !i.disabled;
        })
        .map((i: any) => String(i.id))
        .filter(Boolean);
    } catch {
      return []; // snapshot failure is non-fatal; finalize will do a full-list match
    }
  }

  /** Call Postiz to get the Instagram OAuth URL that adds a channel to our org workspace. */
  private async postizConnectUrl(): Promise<string> {
    const res = await fetch(`${this.postizBase}/social/instagram`, {
      headers: { Authorization: this.env.POSTIZ_API_KEY },
    });
    let json: any;
    try { json = await res.json(); } catch (parseErr) {
      this.log.warn(`Postiz connect URL response not JSON (${res.status}): ${(parseErr as Error).message}`);
      throw new BadRequestException("Could not reach Postiz to start Instagram connect.");
    }
    if (!res.ok || !json?.url) throw new BadRequestException("Could not reach Postiz to start Instagram connect.");
    return String(json.url);
  }

  /**
   * Called after the worker has authorized on Instagram and returned to the app.
   * Uses a snapshot diff to only claim channels that appeared after connect was
   * initiated, and checks for duplicate ownership to prevent channel hijacking.
   */
  async finalizePostizConnect(userId: string): Promise<SocialAccountInfo> {
    // Pick the most-recently-created pending row for this user.
    const pending = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram", connected: false },
      orderBy: { createdAt: "desc" },
    });
    // accessTokenEnc holds the pre-connect snapshot; absence means the flow was never started.
    if (!pending?.accessTokenEnc) throw new BadRequestException("No pending Instagram connect found. Start again.");

    // Parse the pre-connect snapshot stored in accessTokenEnc.
    let snapshotIds: Set<string>;
    try {
      const stored = JSON.parse(pending.accessTokenEnc) as string[];
      snapshotIds = new Set(Array.isArray(stored) ? stored : []);
    } catch {
      snapshotIds = new Set();
    }

    const res = await fetch(`${this.postizBase}/integrations`, {
      headers: { Authorization: this.env.POSTIZ_API_KEY },
    });
    let list: Array<Record<string, unknown>>;
    try {
      const raw = await res.json();
      list = Array.isArray(raw) ? raw : [];
    } catch (parseErr) {
      this.log.error(`Postiz integrations parse failed (${res.status}): ${(parseErr as Error).message}`);
      throw new BadRequestException("Could not fetch Postiz integrations (unexpected response format).");
    }
    if (!res.ok) throw new BadRequestException("Could not fetch Postiz integrations.");

    // Log ALL identifiers so we can see what Postiz actually returns (helps debug identifier mismatch).
    const allIdentifiers = [...new Set(list.map((i) => String(i.identifier ?? "??")))].join(",");
    this.log.log(`Postiz /integrations returned ${list.length} entries. Identifiers seen: [${allIdentifiers}]. Snapshot: [${[...snapshotIds].join(",")}]`);

    const igEntries = list.filter((i) => {
      const id = String(i.identifier ?? "");
      // Accept common Instagram identifier variants returned by different Postiz versions.
      return (id === "instagram" || id === "instagram_business" || id === "facebook_instagram") && !i.disabled;
    });

    // Prefer channels that appeared after the snapshot (truly new).
    // Fall back to any unclaimed channel — handles the case where the user's Instagram
    // was already in the Postiz workspace (e.g. from a prior attempt or shared FB account).
    const newEntries = igEntries.filter((i) => !snapshotIds.has(String(i.id)));

    // Find which entries are unclaimed by any OTHER worker.
    const claimedIds = new Set(
      (await this.prisma.socialAccount.findMany({
        where: { remoteUserId: { in: igEntries.map((i) => String(i.id)) }, connected: true, userId: { not: userId } },
        select: { remoteUserId: true },
      })).map((r) => r.remoteUserId).filter(Boolean) as string[],
    );

    const match =
      // 1. New channel not already claimed by anyone
      newEntries.find((i) => !claimedIds.has(String(i.id))) ??
      // 2. Existing channel already claimed by THIS user (reconnect scenario)
      igEntries.find((i) => {
        const id = String(i.id);
        return !claimedIds.has(id) || false; // unclaimed existing
      }) ??
      undefined;

    if (!match) {
      this.log.warn(
        `Postiz IG finalize: no claimable integration found. ` +
        `Snapshot ids: ${[...snapshotIds].slice(0, 5).join(",")}. ` +
        `Claimed by others: ${[...claimedIds].join(",")}. ` +
        `Current IG entries: ${JSON.stringify(igEntries.map((i) => ({ id: i.id, profile: i.profile, name: i.name })))}`,
      );
      throw new BadRequestException(
        "Instagram account not found in Postiz. Complete the Facebook login in the browser that opened, then tap 'Complete Setup'.",
      );
    }

    const integrationId = String(match.id);

    // Prevent two workers from claiming the same Postiz channel.
    const alreadyOwned = await this.prisma.socialAccount.findFirst({
      where: { remoteUserId: integrationId, connected: true, userId: { not: userId } },
    });
    if (alreadyOwned) {
      this.log.warn(`Integration ${integrationId} is already claimed by another worker.`);
      throw new BadRequestException(
        "This Instagram channel is already connected to another account. If this is your account, disconnect it from the other worker first.",
      );
    }

    // Discover the handle directly from the Postiz integration object.
    const discoveredHandle = String(match.profile ?? match.name ?? "").replace(/^@/, "") || null;

    // If this user already has a connected row for the same remoteUserId, reuse it.
    const existingConnected = await this.prisma.socialAccount.findFirst({
      where: { userId, remoteUserId: integrationId, connected: true },
    });

    let a;
    if (existingConnected) {
      a = existingConnected;
    } else {
      a = await this.prisma.socialAccount.update({
        where: { id: pending.id },
        data: { connected: true, remoteUserId: integrationId, handle: discoveredHandle, accessTokenEnc: null },
      });
    }

    // Delete any remaining pending rows (stale connect attempts) to prevent re-finalize loops.
    await this.prisma.socialAccount.deleteMany({ where: { userId, platform: "instagram", connected: false } });

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

      const existingGraph = await this.prisma.socialAccount.findFirst({ where: { userId, platform: "instagram", remoteUserId: account.igUserId } });
      const noneConnected = (await this.prisma.socialAccount.count({ where: { userId, platform: "instagram", connected: true } })) === 0;
      if (existingGraph) {
        await this.prisma.socialAccount.update({
          where: { id: existingGraph.id },
          data: { type: "business", connected: true, handle: account.username, remoteUserId: account.igUserId, accessTokenEnc: encryptSecret(account.pageToken, this.env.SOCIAL_TOKEN_ENC_KEY), tokenExpiresAt: longTok.expiresAt },
        });
      } else {
        await this.prisma.socialAccount.create({
          data: { userId, platform: "instagram", type: "business", connected: true, isPrimary: noneConnected, handle: account.username, remoteUserId: account.igUserId, accessTokenEnc: encryptSecret(account.pageToken, this.env.SOCIAL_TOKEN_ENC_KEY), tokenExpiresAt: longTok.expiresAt },
        });
      }
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
    socialAccountId?: string,
  ): Promise<{ published: boolean; remoteId: string }> {
    const creative = await this.prisma.creative.findUnique({ where: { id: creativeId } });
    if (!creative) throw new NotFoundException("Creative not found.");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const render = await this.prisma.personalizedRender.findUnique({
      where: { userId_creativeId: { userId, creativeId } },
    });
    const mediaUrl = mediaUrlOverride ?? render?.cachedUrl ?? creative.sourceKey;
    const caption = this.captionFor(creative.captionVariants, user.preferredLanguage);

    const acct = socialAccountId
      ? await this.prisma.socialAccount.findFirst({ where: { id: socialAccountId, userId } })
      : await this.prisma.socialAccount.findFirst({ where: { userId, platform: "instagram", isPrimary: true, connected: true } })
        ?? await this.prisma.socialAccount.findFirst({ where: { userId, platform: "instagram", connected: true } });
    if (!acct || !acct.connected || acct.type === "personal") {
      throw new ForbiddenException("Connect a Creator/Business Instagram account first.");
    }

    let remoteId: string;
    try {
      ({ remoteId } = await this.ig.publish({
        account: {
          handle: acct.handle ?? "",
          accessToken: this.postizMode ? undefined : this.tokenFor(acct),
          igUserId: this.postizMode ? undefined : acct.remoteUserId ?? undefined,
          integrationId: this.postizMode ? acct.remoteUserId ?? undefined : undefined,
        },
        mediaUrl,
        caption,
        kind,
      }));
    } catch (e) {
      // Provider failures (expired/missing token, API errors) are a user-fixable
      // state, not a server fault — surface a clean 400 instead of a 500.
      throw new BadRequestException(
        `Instagram publish failed: ${(e as Error).message}. Try reconnecting your Instagram account.`,
      );
    }

    await this.upsertShareReachEvent(userId, creativeId, remoteId);
    return { published: true, remoteId };
  }

  private async upsertShareReachEvent(userId: string, creativeId: string, remoteId: string) {
    let share = await this.prisma.shareEvent.findFirst({ where: { userId, creativeId } });
    if (!share) {
      share = await this.prisma.shareEvent.create({
        data: {
          userId,
          creativeId,
          channel: "instagram_feed",
          trackedLinkId: `${userId.slice(-6)}-${creativeId.slice(-6)}-ig${remoteId.slice(-8)}`,
          basePointsAwarded: 0,
        },
      });
    }
    await this.prisma.reachEvent.upsert({
      where: { shareEventId_source: { shareEventId: share.id, source: "instagram_insights" } },
      create: { shareEventId: share.id, igMediaId: remoteId, source: "instagram_insights", uniqueCount: 0 },
      update: { igMediaId: remoteId },
    });
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
