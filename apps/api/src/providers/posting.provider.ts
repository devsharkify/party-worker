import { Injectable, Logger } from "@nestjs/common";
import type { ShareChannel } from "@pw/shared";

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
  account: { handle: string; accessToken?: string };
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
