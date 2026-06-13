import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret, encryptSecret, sha256 } from "../auth/crypto.util";

const POSTIZ_BASE = "https://api.postiz.com/public/v1";
const POSTIZ_AUTH_URL = "https://platform.postiz.com/oauth/authorize";
const POSTIZ_TOKEN_URL = "https://api.postiz.com/oauth/token";

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;
}

@Injectable()
export class PostizService {
  private readonly log = new Logger("PostizService");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  // ── OAuth2 connect ────────────────────────────────────────────────────────

  getConnectUrl(userId: string): string {
    const u = new URL(POSTIZ_AUTH_URL);
    u.searchParams.set("client_id", this.env.POSTIZ_CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("state", this.signState(userId));
    return u.toString();
  }

  async handleCallback(code: string, state: string): Promise<{ redirectUrl: string }> {
    const userId = this.verifyState(state);
    const fail = (msg: string) =>
      `${this.env.SOCIAL_CONNECT_RETURN_URL}?postiz=error&reason=${encodeURIComponent(msg)}`;
    if (!userId) return { redirectUrl: fail("Invalid OAuth state") };

    try {
      const posToken = await this.exchangeCode(code);

      // Discover their connected Instagram integration inside Postiz
      const integration = await this.findIntegration(posToken, "instagram");

      await this.prisma.socialAccount.upsert({
        where: { userId_platform: { userId, platform: "instagram" } },
        create: {
          userId,
          platform: "instagram",
          type: "creator",
          connected: !!integration,
          handle: integration?.name ?? null,
          remoteUserId: integration?.id ?? null,
          accessTokenEnc: encryptSecret(posToken, this.env.SOCIAL_TOKEN_ENC_KEY),
        },
        update: {
          type: "creator",
          connected: !!integration,
          handle: integration?.name ?? null,
          remoteUserId: integration?.id ?? null,
          accessTokenEnc: encryptSecret(posToken, this.env.SOCIAL_TOKEN_ENC_KEY),
        },
      });

      const qs = integration ? "postiz=connected" : "postiz=pending&reason=no_instagram_linked";
      return { redirectUrl: `${this.env.SOCIAL_CONNECT_RETURN_URL}?${qs}` };
    } catch (e) {
      this.log.error(`Postiz callback failed: ${(e as Error).message}`);
      return { redirectUrl: fail((e as Error).message) };
    }
  }

  // ── Publishing ────────────────────────────────────────────────────────────

  /** Post a creative on behalf of a worker who connected via Postiz OAuth. */
  async publishForWorker(
    userId: string,
    mediaUrl: string,
    caption: string,
  ): Promise<{ postId: string }> {
    const acct = await this.prisma.socialAccount.findFirst({
      where: { userId, platform: "instagram", connected: true },
    });
    if (!acct?.accessTokenEnc) {
      throw new BadRequestException("Connect Instagram via Postiz first.");
    }

    const posToken = decryptSecret(acct.accessTokenEnc, this.env.SOCIAL_TOKEN_ENC_KEY);

    // If we don't yet have an integration ID (user hadn't linked IG when they authed),
    // try to discover it now.
    let integrationId = acct.remoteUserId;
    if (!integrationId) {
      const ig = await this.findIntegration(posToken, "instagram");
      if (!ig) throw new BadRequestException("Link an Instagram account in Postiz, then retry.");
      integrationId = ig.id;
      await this.prisma.socialAccount.update({
        where: { userId_platform: { userId, platform: "instagram" } },
        data: { remoteUserId: ig.id, handle: ig.name, connected: true },
      });
    }

    const media = await this.uploadFromUrl(posToken, mediaUrl);
    const result = await this.createPost(posToken, integrationId, caption, media);
    return { postId: result[0]?.postId ?? "queued" };
  }

  /** Post from the admin's own Postiz account (API key), used for official broadcasts. */
  async publishWithApiKey(
    integrationId: string,
    mediaUrl: string,
    caption: string,
  ): Promise<{ postId: string }> {
    const token = this.env.POSTIZ_API_KEY;
    const media = await this.uploadFromUrl(token, mediaUrl);
    const result = await this.createPost(token, integrationId, caption, media);
    return { postId: result[0]?.postId ?? "queued" };
  }

  /** List channels connected to the admin's own Postiz account. */
  async listAdminIntegrations(): Promise<PostizIntegration[]> {
    return this.listIntegrations(this.env.POSTIZ_API_KEY);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async exchangeCode(code: string): Promise<string> {
    const res = await fetch(POSTIZ_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: this.env.POSTIZ_CLIENT_ID,
        client_secret: this.env.POSTIZ_CLIENT_SECRET,
        redirect_uri: this.env.POSTIZ_REDIRECT_URL,
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new Error(json?.message ?? `Postiz token exchange failed (${res.status})`);
    }
    return json.access_token as string;
  }

  private async listIntegrations(token: string): Promise<PostizIntegration[]> {
    const res = await fetch(`${POSTIZ_BASE}/integrations`, {
      headers: { Authorization: token },
    });
    const json: any = await res.json().catch(() => []);
    const list: any[] = Array.isArray(json) ? json : (json.integrations ?? []);
    return list.map((i) => ({
      id: i.id as string,
      name: (i.profile ?? i.name ?? i.identifier) as string,
      identifier: i.identifier as string,
    }));
  }

  private async findIntegration(token: string, identifier: string): Promise<PostizIntegration | null> {
    const list = await this.listIntegrations(token).catch(() => []);
    return list.find((i) => i.identifier === identifier) ?? null;
  }

  private async uploadFromUrl(token: string, url: string): Promise<{ id: string; path: string }> {
    const res = await fetch(`${POSTIZ_BASE}/upload-from-url`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Postiz upload failed (${res.status}): ${json?.message ?? ""}`);
    return { id: json.id as string, path: json.path as string };
  }

  private async createPost(
    token: string,
    integrationId: string,
    content: string,
    media: { id: string; path: string },
  ): Promise<{ postId: string }[]> {
    const res = await fetch(`${POSTIZ_BASE}/posts`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "now",
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id: integrationId },
            value: [{ content, image: [media] }],
            settings: { __type: "instagram-standalone", post_type: "post" },
          },
        ],
      }),
    });
    const json: any = await res.json().catch(() => []);
    if (!res.ok) throw new Error(`Postiz post failed (${res.status}): ${json?.message ?? ""}`);
    return Array.isArray(json) ? json : [json];
  }

  // CSRF state: signed with userId + SOCIAL_TOKEN_ENC_KEY, prefixed "pz." to
  // avoid collisions with the existing Meta OAuth state format.
  private signState(userId: string): string {
    const sig = sha256(`pz.${userId}.${this.env.SOCIAL_TOKEN_ENC_KEY}`).slice(0, 24);
    return `${Buffer.from(userId).toString("base64url")}.${sig}`;
  }

  private verifyState(state: string): string | null {
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return null;
    const userId = Buffer.from(b64, "base64url").toString("utf8");
    return sha256(`pz.${userId}.${this.env.SOCIAL_TOKEN_ENC_KEY}`).slice(0, 24) === sig
      ? userId
      : null;
  }
}
