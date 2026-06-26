import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { RedisRateLimitStore } from "../common/redis-ratelimit.store";

const IG_CONNECT_LOCK_KEY = "social:instagram:connect:lock";
const YT_CONNECT_LOCK_KEY = "social:youtube:connect:lock";
const IG_CONNECT_LOCK_TTL = 120;

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
    private readonly lock: RedisRateLimitStore,
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
      const acquired = await this.lock.acquireLock(IG_CONNECT_LOCK_KEY, IG_CONNECT_LOCK_TTL);
      if (!acquired) {
        const remaining = await this.lock.lockTtl(IG_CONNECT_LOCK_KEY);
        throw new ConflictException(
          `Another Instagram connection is already in progress. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
        );
      }

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
   * Returns Instagram channels in Postiz that are candidates for this worker to claim.
   * Filters by: appeared after connect was initiated (timestamp > pending.createdAt OR
   * not in pre-connect snapshot), and not already claimed by another worker.
   * The client shows these as a picker so the worker confirms their own handle.
   */
  async getPendingChannels(userId: string): Promise<{ id: string; handle: string | null; name: string | null }[]> {
    const pending = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram", connected: false },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return [];

    // Parse the pre-connect snapshot (fallback filter when Postiz doesn't return createdAt).
    let snapshotIds: Set<string> = new Set();
    try {
      const stored = JSON.parse(pending.accessTokenEnc ?? "[]") as string[];
      if (Array.isArray(stored)) snapshotIds = new Set(stored);
    } catch { /* non-fatal */ }

    const res = await fetch(`${this.postizBase}/integrations`, {
      headers: { Authorization: this.env.POSTIZ_API_KEY },
    });
    let list: Array<Record<string, unknown>>;
    try {
      const raw = await res.json();
      list = Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
    if (!res.ok) return [];

    const igEntries = list.filter((i) => {
      const id = String(i.identifier ?? "");
      return (id === "instagram" || id === "instagram_business" || id === "facebook_instagram") && !i.disabled;
    });

    // Primary filter: channels created after this connect was initiated (pending row's createdAt).
    // More reliable than snapshot diff — Postiz's createdAt is monotonic; snapshot can fail silently.
    const pendingCreatedAt = pending.createdAt;
    const byTimestamp = igEntries.filter((i) => {
      if (!i.createdAt) return false;
      try { return new Date(i.createdAt as string) > pendingCreatedAt; } catch { return false; }
    });

    // Secondary filter: snapshot diff (channels not in the pre-connect snapshot).
    const bySnapshot = igEntries.filter((i) => !snapshotIds.has(String(i.id)));

    // Use timestamp candidates first, fall back to snapshot, fall back to all IG channels.
    const candidates =
      byTimestamp.length > 0 ? byTimestamp :
      bySnapshot.length > 0  ? bySnapshot  :
      igEntries;

    // Remove channels already claimed by a different worker.
    const claimedByOthers = new Set(
      (await this.prisma.socialAccount.findMany({
        where: { remoteUserId: { in: candidates.map((i) => String(i.id)) }, connected: true, userId: { not: userId } },
        select: { remoteUserId: true },
      })).map((r) => r.remoteUserId).filter(Boolean) as string[],
    );

    return candidates
      .filter((i) => !claimedByOthers.has(String(i.id)))
      .map((i) => ({
        id: String(i.id),
        handle: String(i.profile ?? "").replace(/^@/, "") || null,
        name: String(i.name ?? "") || null,
      }));
  }

  /**
   * Called after the worker confirms their Instagram channel.
   * When integrationId is provided (from the picker), the server links it directly —
   * no guessing. Falls back to auto-detect for old clients that don't send an ID.
   */
  async finalizePostizConnect(userId: string, integrationId?: string): Promise<SocialAccountInfo> {
    const pending = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram", connected: false },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("No pending Instagram connect found. Start again.");

    // Always release the global connect lock — success or failure.
    // Lock was acquired in connectInstagram (postiz mode). If the flow was
    // never started (no pending row), release is a no-op.
    try {

    // --- Fast path: client told us exactly which channel to claim ---
    if (integrationId) {
      const res = await fetch(`${this.postizBase}/integrations`, {
        headers: { Authorization: this.env.POSTIZ_API_KEY },
      });
      let list: Array<Record<string, unknown>> = [];
      try {
        const raw = await res.json();
        list = Array.isArray(raw) ? raw : [];
      } catch { /* non-fatal */ }

      const match = list.find((i) => String(i.id) === integrationId);
      if (!match) throw new BadRequestException("That Instagram channel was not found in Postiz. Try reconnecting.");

      return this.claimIntegration(userId, pending, match);
    }

    // --- Fallback: auto-detect (no integrationId sent — legacy / edge case) ---
    if (!pending.accessTokenEnc) throw new BadRequestException("No pending Instagram connect found. Start again.");

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

    const allIdentifiers = [...new Set(list.map((i) => String(i.identifier ?? "??")))].join(",");
    this.log.log(`Postiz /integrations returned ${list.length} entries. Identifiers seen: [${allIdentifiers}].`);

    const igEntries = list.filter((i) => {
      const id = String(i.identifier ?? "");
      return (id === "instagram" || id === "instagram_business" || id === "facebook_instagram") && !i.disabled;
    });

    const claimedIds = new Set(
      (await this.prisma.socialAccount.findMany({
        where: { remoteUserId: { in: igEntries.map((i) => String(i.id)) }, connected: true, userId: { not: userId } },
        select: { remoteUserId: true },
      })).map((r) => r.remoteUserId).filter(Boolean) as string[],
    );

    const newEntries = igEntries.filter((i) => !snapshotIds.has(String(i.id)));
    const match = newEntries.find((i) => !claimedIds.has(String(i.id)));

    if (!match) {
      this.log.warn(`Postiz IG finalize: no claimable integration found. Claimed by others: ${[...claimedIds].join(",")}.`);
      throw new BadRequestException(
        "Instagram account not found in Postiz. Complete the Facebook login in the browser that opened, then tap 'Complete Setup'.",
      );
    }

    return this.claimIntegration(userId, pending, match);
    } finally {
      await this.lock.releaseLock(IG_CONNECT_LOCK_KEY);
    }
  }

  /** Shared logic: link a Postiz integration to a worker's pending row. */
  private async claimIntegration(
    userId: string,
    pending: { id: string; isPrimary: boolean; createdAt: Date },
    match: Record<string, unknown>,
  ): Promise<SocialAccountInfo> {
    const integrationId = String(match.id);

    // Check if another worker already holds this channel.
    const alreadyOwned = await this.prisma.socialAccount.findFirst({
      where: { remoteUserId: integrationId, connected: true, userId: { not: userId } },
    });

    if (alreadyOwned) {
      // Force-transfer proof: the current worker just completed a fresh OAuth for this channel
      // (pending row was created AFTER the previous owner connected it). Only the real account
      // holder can successfully complete Facebook OAuth for that Instagram account, so a fresh
      // pending row is sufficient proof of ownership. Transfer the channel.
      const previousOwnerConnectedAt = alreadyOwned.createdAt ?? new Date(0);
      const freshOAuth = pending.createdAt > previousOwnerConnectedAt;

      if (!freshOAuth) {
        throw new BadRequestException(
          "This Instagram channel is already connected to another account. To reclaim it, tap 'Connect Instagram' and complete the Facebook login — that proves you own the account.",
        );
      }

      // Transfer: disconnect from the previous (wrong) owner and hand it to this worker.
      this.log.warn(
        `Force-transfer: integration ${integrationId} moving from worker ${alreadyOwned.userId} to ${userId} (fresh OAuth proof).`,
      );
      await this.prisma.socialAccount.update({
        where: { id: alreadyOwned.id },
        data: { connected: false, remoteUserId: null, handle: null },
      });
    }

    const discoveredHandle = String(match.profile ?? match.name ?? "").replace(/^@/, "") || null;

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

    await this.prisma.socialAccount.deleteMany({ where: { userId, platform: "instagram", connected: false } });
    return this.toInfo(a);
  }

  // --- YouTube (postiz mode) ---------------------------------------------------

  async connectYoutube(userId: string): Promise<{ authorizeUrl: string; mode: string }> {
    const acquired = await this.lock.acquireLock(YT_CONNECT_LOCK_KEY, IG_CONNECT_LOCK_TTL);
    if (!acquired) {
      const remaining = await this.lock.lockTtl(YT_CONNECT_LOCK_KEY);
      throw new ConflictException(
        `Another YouTube connection is in progress. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
      );
    }
    await this.prisma.socialAccount.deleteMany({ where: { userId, platform: "youtube", connected: false } });
    const snapshot = await this.postizYoutubeIntegrationIds();
    const existing = await this.prisma.socialAccount.count({ where: { userId, platform: "youtube", connected: true } });
    await this.prisma.socialAccount.create({
      data: { userId, platform: "youtube", type: "creator", connected: false, isPrimary: existing === 0, handle: null, accessTokenEnc: JSON.stringify(snapshot) },
    });
    const url = await this.postizYoutubeConnectUrl();
    return { authorizeUrl: url, mode: "postiz" };
  }

  async disconnectYoutube(userId: string, accountId: string): Promise<{ id: string }> {
    const acct = await this.prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
    if (!acct) throw new NotFoundException("Social account not found.");
    await this.prisma.socialAccount.delete({ where: { id: accountId } });
    if (acct.isPrimary) {
      const next = await this.prisma.socialAccount.findFirst({ where: { userId, platform: "youtube", connected: true }, orderBy: { createdAt: "asc" } });
      if (next) await this.prisma.socialAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    return { id: accountId };
  }

  async getPendingYoutubeChannels(userId: string): Promise<{ id: string; handle: string | null; name: string | null }[]> {
    const pending = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "youtube", connected: false },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return [];
    let snapshotIds: Set<string> = new Set();
    try {
      const stored = JSON.parse(pending.accessTokenEnc ?? "[]") as string[];
      if (Array.isArray(stored)) snapshotIds = new Set(stored);
    } catch { /* non-fatal */ }
    const res = await fetch(`${this.postizBase}/integrations`, { headers: { Authorization: this.env.POSTIZ_API_KEY } });
    let list: Array<Record<string, unknown>> = [];
    try { const raw = await res.json(); list = Array.isArray(raw) ? raw : []; } catch { return []; }
    if (!res.ok) return [];
    const ytEntries = list.filter((i) => String(i.identifier ?? "").includes("youtube") && !i.disabled);
    const pendingCreatedAt = pending.createdAt;
    const byTimestamp = ytEntries.filter((i) => {
      if (!i.createdAt) return false;
      try { return new Date(i.createdAt as string) > pendingCreatedAt; } catch { return false; }
    });
    const bySnapshot = ytEntries.filter((i) => !snapshotIds.has(String(i.id)));
    const candidates = byTimestamp.length > 0 ? byTimestamp : bySnapshot.length > 0 ? bySnapshot : ytEntries;
    const claimedByOthers = new Set(
      (await this.prisma.socialAccount.findMany({
        where: { remoteUserId: { in: candidates.map((i) => String(i.id)) }, connected: true, userId: { not: userId } },
        select: { remoteUserId: true },
      })).map((r) => r.remoteUserId).filter(Boolean) as string[],
    );
    return candidates
      .filter((i) => !claimedByOthers.has(String(i.id)))
      .map((i) => ({ id: String(i.id), handle: String(i.profile ?? "").replace(/^@/, "") || null, name: String(i.name ?? "") || null }));
  }

  async finalizeYoutubeConnect(userId: string, integrationId?: string): Promise<SocialAccountInfo> {
    const pending = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "youtube", connected: false },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("No pending YouTube connect found. Start again.");
    try {
      if (!integrationId) throw new BadRequestException("No YouTube channel selected.");
      const res = await fetch(`${this.postizBase}/integrations`, { headers: { Authorization: this.env.POSTIZ_API_KEY } });
      let list: Array<Record<string, unknown>> = [];
      try { const raw = await res.json(); list = Array.isArray(raw) ? raw : []; } catch { /* non-fatal */ }
      const match = list.find((i) => String(i.id) === integrationId);
      if (!match) throw new BadRequestException("That YouTube channel was not found in Postiz. Try reconnecting.");
      const handle = String(match.profile ?? match.name ?? "").replace(/^@/, "") || null;
      const a = await this.prisma.socialAccount.update({
        where: { id: pending.id },
        data: { connected: true, remoteUserId: integrationId, handle, accessTokenEnc: null },
      });
      await this.prisma.socialAccount.deleteMany({ where: { userId, platform: "youtube", connected: false } });
      return this.toInfo(a);
    } finally {
      await this.lock.releaseLock(YT_CONNECT_LOCK_KEY);
    }
  }

  async publishToYoutube(
    userId: string,
    creativeId: string,
    mediaUrlOverride?: string,
    socialAccountId?: string,
  ): Promise<{ published: boolean; remoteId: string }> {
    const creative = await this.prisma.creative.findUnique({ where: { id: creativeId } });
    if (!creative) throw new NotFoundException("Creative not found.");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const render = await this.prisma.personalizedRender.findUnique({ where: { userId_creativeId: { userId, creativeId } } });
    const mediaUrl = mediaUrlOverride ?? render?.cachedUrl ?? creative.sourceKey;
    const caption = this.captionFor(creative.captionVariants, user.preferredLanguage);
    const acct = socialAccountId
      ? await this.prisma.socialAccount.findFirst({ where: { id: socialAccountId, userId } })
      : await this.prisma.socialAccount.findFirst({ where: { userId, platform: "youtube", isPrimary: true, connected: true } })
        ?? await this.prisma.socialAccount.findFirst({ where: { userId, platform: "youtube", connected: true } });
    if (!acct || !acct.connected) throw new ForbiddenException("Connect a YouTube channel first.");
    const integrationId = acct.remoteUserId;
    if (!integrationId) throw new ForbiddenException("YouTube channel not linked. Reconnect.");
    const mediaRes = await fetch(`${this.postizBase}/media`, {
      method: "POST",
      headers: { Authorization: this.env.POSTIZ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url: mediaUrl }),
    });
    let media: any;
    try { media = await mediaRes.json(); } catch { media = {}; }
    const publishRes = await fetch(`${this.postizBase}/posts`, {
      method: "POST",
      headers: { Authorization: this.env.POSTIZ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "now",
        date: new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [{ integration: { id: integrationId }, value: [{ content: caption, image: [media] }], settings: { __type: "youtube" } }],
      }),
    });
    let json: any;
    try { json = await publishRes.json(); } catch { json = {}; }
    if (!publishRes.ok) throw new BadRequestException(`YouTube publish failed: ${json?.message ?? publishRes.status}`);
    const remoteId = String(json?.[0]?.id ?? json?.postId ?? json?.id ?? `yt_${Date.now()}`);
    return { published: true, remoteId };
  }

  private async postizYoutubeIntegrationIds(): Promise<string[]> {
    try {
      const res = await fetch(`${this.postizBase}/integrations`, { headers: { Authorization: this.env.POSTIZ_API_KEY } });
      const list: any = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(list)) return [];
      return list.filter((i: any) => String(i.identifier ?? "").includes("youtube") && !i.disabled).map((i: any) => String(i.id)).filter(Boolean);
    } catch { return []; }
  }

  private async postizYoutubeConnectUrl(): Promise<string> {
    const res = await fetch(`${this.postizBase}/social/youtube`, { headers: { Authorization: this.env.POSTIZ_API_KEY } });
    let json: any;
    try { json = await res.json(); } catch {
      throw new BadRequestException("Could not reach Postiz to start YouTube connect.");
    }
    if (!res.ok || !json?.url) throw new BadRequestException("Could not reach Postiz to start YouTube connect.");
    return String(json.url);
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
