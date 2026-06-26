import { Injectable, Logger } from "@nestjs/common";
import type { ShareChannel } from "@pw/shared";
import { loadEnv } from "../config/env";

export const ASSISTED_SHARE = Symbol("ASSISTED_SHARE");
export const INSTAGRAM_PROVIDER = Symbol("INSTAGRAM_PROVIDER");

// --- AssistedShare (default, no API, no ban risk) ---

export interface BuildDeepLinksInput {
  caption: string;
  mediaUrl: string;
  channel: ShareChannel;
}

export interface AssistedShareProvider {
  /** Deep links for the native share sheet / channel buttons. */
  buildDeepLinks(input: BuildDeepLinksInput): Record<string, string>;
}

@Injectable()
export class DefaultAssistedShareProvider implements AssistedShareProvider {
  buildDeepLinks({ caption, mediaUrl }: BuildDeepLinksInput): Record<string, string> {
    const text = encodeURIComponent(caption);
    const media = encodeURIComponent(mediaUrl);
    return {
      // The real default is the OS share sheet with the rendered media + caption.
      // These deep links are best-effort fallbacks for direct channel buttons.
      whatsapp: `whatsapp://send?text=${text}`,
      whatsapp_web: `https://wa.me/?text=${text}`,
      instagram: `instagram://library?AssetPath=${media}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${media}`,
    };
  }
}

// --- Instagram Graph (opt-in, connected Creator/Business accounts only) ---

export interface IgPublishInput {
  account: { handle: string; accessToken?: string; igUserId?: string; integrationId?: string };
  mediaUrl: string;
  caption: string;
  kind: "feed" | "story" | "reel";
}

export interface IgInsights {
  /** Stories use `views` (impressions was deprecated Apr 2025). */
  reach: number;
  views: number;
  likes: number;
  comments: number;
}

export interface InstagramProvider {
  /** Content Publishing API: create container -> publish. Limit ~100/day/account. */
  publish(input: IgPublishInput): Promise<{ remoteId: string }>;
  /** Read insights on a media item. Story insights must be fetched within 24h. */
  getInsights(input: { mediaId: string; accessToken?: string }): Promise<IgInsights>;
}

/** Dev provider: no Meta calls. Deterministic mock numbers so the demo is stable. */
@Injectable()
export class MockInstagramProvider implements InstagramProvider {
  private readonly log = new Logger("MockInstagramProvider");

  async publish(input: IgPublishInput): Promise<{ remoteId: string }> {
    const remoteId = `mock_ig_${input.kind}_${Date.now()}`;
    this.log.log(`IG publish (mock) ${input.kind} as @${input.account.handle} -> ${remoteId}`);
    return { remoteId };
  }

  async getInsights(input: { mediaId: string }): Promise<IgInsights> {
    // Stable pseudo-random numbers derived from the media id.
    let h = 0;
    for (const ch of input.mediaId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const reach = 150 + (h % 850);
    return {
      reach,
      views: reach + (h % 300),
      likes: Math.floor(reach / 8),
      comments: Math.floor(reach / 40),
    };
  }
}

/**
 * Postiz provider (INSTAGRAM_PROVIDER=postiz).
 * One org-level workspace — each worker's IG is a channel; their integration id
 * is stored in remoteUserId and passed here as integrationId.
 */
@Injectable()
export class PostizInstagramProvider implements InstagramProvider {
  private readonly log = new Logger("PostizInstagramProvider");
  private readonly env = loadEnv();

  private get base(): string {
    return this.env.POSTIZ_BASE_URL.replace(/\/$/, "");
  }

  /** Trusted origins for server-side media fetches (SSRF guard). */
  private get trustedHosts(): string[] {
    return [
      this.env.STORAGE_PUBLIC_BASE,
      this.env.R2_PUBLIC_BASE ?? "",
      this.env.IK_URL_ENDPOINT ?? "",
    ]
      .filter(Boolean)
      .map((b) => {
        try { return new URL(b).hostname; } catch { return ""; }
      })
      .filter(Boolean);
  }

  private assertTrustedMediaUrl(url: string): void {
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch {
      throw new Error(`Invalid media URL: ${url}`);
    }
    // Allow localhost in dev (STORAGE_PUBLIC_BASE defaults to localhost:4000).
    if (this.trustedHosts.includes(hostname)) return;
    throw new Error(`Media URL host not permitted for server-side fetch: ${hostname}`);
  }

  private resolveIntegrationId(input: IgPublishInput): { token: string; integrationId: string } {
    const token = this.env.POSTIZ_API_KEY;
    // Never fall back to the org integration id — that would silently post to a
    // different worker's IG account. Require an explicit per-worker integration id.
    const integrationId = input.account.integrationId;
    if (!token) throw new Error("Postiz: POSTIZ_API_KEY not configured.");
    if (!integrationId) throw new Error("Postiz: worker has no Instagram channel connected. Tap Connect Instagram.");
    return { token, integrationId };
  }

  async publish(input: IgPublishInput): Promise<{ remoteId: string }> {
    const { token, integrationId } = this.resolveIntegrationId(input);
    const media = await this.upload(input.mediaUrl, token);
    // Postiz requires settings.post_type ("post" | "story") for Instagram, else
    // it 400s with "post_type must be one of the following values: post, story".
    const postType = input.kind === "story" ? "story" : "post";
    const json = await this.postizPost(`${this.base}/posts`, {
      type: "now",
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [{ integration: { id: integrationId }, value: [{ content: input.caption, image: [media] }], settings: { __type: "instagram", post_type: postType } }],
    }, token);
    const remoteId = String(json?.[0]?.id ?? json?.postId ?? json?.id ?? `postiz_${Date.now()}`);
    this.log.log(`Postiz published ${input.kind} as @${input.account.handle} -> ${remoteId}`);
    return { remoteId };
  }

  async getInsights(): Promise<IgInsights> {
    // ponytail: Postiz public API has no per-post insight read; zeros = no-op sync.
    // Upgrade path: pull Postiz analytics when reach-based points matter.
    return { reach: 0, views: 0, likes: 0, comments: 0 };
  }

  private async upload(mediaUrl: string, token: string): Promise<{ id: string; path: string }> {
    this.assertTrustedMediaUrl(mediaUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let src: Response;
    try {
      src = await fetch(mediaUrl, { signal: ctrl.signal });
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "Media fetch timed out (30s)" : (e as Error).message;
      throw new Error(`Could not fetch media to share: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
    if (!src.ok) throw new Error(`Could not fetch media to share (${src.status})`);
    const blob = await src.blob();
    const name = mediaUrl.split("?")[0].split("/").pop() || "media";
    const form = new FormData();
    form.append("file", blob, name);
    const res = await fetch(`${this.base}/upload`, { method: "POST", headers: { Authorization: token }, body: form });
    let json: any;
    try { json = await res.json(); } catch (parseErr) {
      this.log.warn(`Postiz upload response not JSON (${res.status}): ${(parseErr as Error).message}`);
      json = {};
    }
    if (!res.ok) {
      this.log.error(`Postiz upload failed (${res.status}): ${JSON.stringify(json)}`);
      throw new Error(json?.message ?? `Postiz media upload failed (HTTP ${res.status})`);
    }
    const item = Array.isArray(json) ? json[0] : json;
    if (!item?.id || !item?.path) throw new Error("Postiz upload returned no id/path");
    return { id: String(item.id), path: String(item.path) };
  }

  private async postizPost(url: string, body: unknown, token: string): Promise<any> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json: any;
    try { json = await res.json(); } catch (parseErr) {
      this.log.warn(`Postiz response not JSON (${res.status}): ${(parseErr as Error).message}`);
      json = {};
    }
    if (!res.ok) {
      this.log.error(`Postiz POST failed (${res.status}): ${JSON.stringify(json)}`);
      throw new Error(json?.message ?? `Postiz request failed (HTTP ${res.status})`);
    }
    return json;
  }
}

/**
 * Real Instagram Graph API provider (used when INSTAGRAM_PROVIDER=graph).
 * Content Publishing: create a media container then publish it. Insights: read
 * reach/likes/comments on a published media. Requires a connected Business/Creator
 * account (igUserId) and a valid page access token, plus app review for
 * instagram_content_publish + instagram_manage_insights in production.
 */
@Injectable()
export class InstagramGraphProvider implements InstagramProvider {
  private readonly log = new Logger("InstagramGraphProvider");
  private readonly env = loadEnv();
  private get base(): string {
    return `https://graph.facebook.com/${this.env.META_GRAPH_VERSION}`;
  }

  async publish(input: IgPublishInput): Promise<{ remoteId: string }> {
    const igUserId = input.account.igUserId;
    const token = input.account.accessToken;
    if (!igUserId || !token) {
      throw new Error("Instagram account is not fully connected (missing account id or token)");
    }

    // 1) Create the media container.
    const createParams = new URLSearchParams({ caption: input.caption, access_token: token });
    if (input.kind === "story") {
      createParams.set("media_type", "STORIES");
      createParams.set("image_url", input.mediaUrl);
    } else if (input.kind === "reel") {
      createParams.set("media_type", "REELS");
      createParams.set("video_url", input.mediaUrl);
    } else {
      createParams.set("image_url", input.mediaUrl);
    }
    const container = await this.graphPost(`${this.base}/${igUserId}/media`, createParams);

    // 2) Video/reel containers process async — wait until FINISHED.
    if (input.kind === "reel") await this.waitForContainer(container.id, token);

    // 3) Publish the container.
    const published = await this.graphPost(
      `${this.base}/${igUserId}/media_publish`,
      new URLSearchParams({ creation_id: container.id, access_token: token }),
    );
    this.log.log(`IG published ${input.kind} as @${input.account.handle} -> ${published.id}`);
    return { remoteId: String(published.id) };
  }

  async getInsights(input: { mediaId: string; accessToken?: string }): Promise<IgInsights> {
    const token = input.accessToken;
    if (!token) throw new Error("Missing Instagram access token for insights");

    const insights = await this.graphGet(`${this.base}/${input.mediaId}/insights`, {
      metric: "reach",
      access_token: token,
    }).catch(() => ({ data: [] }));
    const reach = this.metricValue(insights, "reach");

    const media = await this.graphGet(`${this.base}/${input.mediaId}`, {
      fields: "like_count,comments_count,media_type",
      access_token: token,
    }).catch(() => ({}));

    return {
      reach,
      views: reach, // per-media "views" varies by type; reach is the stable proxy
      likes: Number(media.like_count ?? 0),
      comments: Number(media.comments_count ?? 0),
    };
  }

  private metricValue(resp: { data?: { name: string; values?: { value: number }[] }[] }, name: string): number {
    const item = (resp.data ?? []).find((d) => d.name === name);
    return Number(item?.values?.[0]?.value ?? 0);
  }

  private async waitForContainer(creationId: string, token: string): Promise<void> {
    for (let i = 0; i < 12; i++) {
      const status = await this.graphGet(`${this.base}/${creationId}`, {
        fields: "status_code",
        access_token: token,
      });
      if (status.status_code === "FINISHED") return;
      if (status.status_code === "ERROR") throw new Error("Instagram media processing failed");
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("Instagram media processing timed out");
  }

  private async graphPost(url: string, params: URLSearchParams): Promise<any> {
    const res = await fetch(url, { method: "POST", body: params });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.error(`Graph POST failed (${res.status}): ${JSON.stringify(json?.error ?? json)}`);
      throw new Error(json?.error?.message ?? "Instagram Graph request failed");
    }
    return json;
  }

  private async graphGet(url: string, params: Record<string, string>): Promise<any> {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await fetch(u);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.error(`Graph GET failed (${res.status}): ${JSON.stringify(json?.error ?? json)}`);
      throw new Error(json?.error?.message ?? "Instagram Graph request failed");
    }
    return json;
  }
}
