import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CaptionVariants, FeedItem, PersonalizedRenderInfo } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import type { DeviceTier } from "@pw/shared";
import { overlayBannerOnVideo } from "./video-banner";

const NEW_WINDOW_MS = 48 * 3600_000;

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private mediaUrl(key: string): string {
    return /^https?:\/\//.test(key) ? key : this.storage.publicUrl(key);
  }

  async getFeed(userId: string): Promise<FeedItem[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ancestorIds = (await this.org.getAncestorChain(user.orgUnitId)).map((n) => n.id);

    const creatives = await this.prisma.creative.findMany({
      where: {
        published: true,
        OR: [{ targetOrgUnitId: null }, { targetOrgUnitId: { in: ancestorIds } }],
      },
      // Breaking items sorted first, then newest
      orderBy: [{ isBreaking: "desc" }, { publishedAt: "desc" }],
      take: 30,
      include: { targetOrgUnit: { select: { name: true } } },
    });

    const renders = await this.prisma.personalizedRender.findMany({
      where: { userId, creativeId: { in: creatives.map((c) => c.id) } },
    });
    const renderByCreative = new Map(renders.map((r) => [r.creativeId, r]));

    return creatives.map((c) => {
      const render = renderByCreative.get(c.id);
      const publishedAt = (c.publishedAt ?? c.createdAt).toISOString();
      return {
        creativeId: c.id,
        title: c.title,
        type: c.type,
        sourceUrl: this.mediaUrl(c.sourceKey),
        thumbnailUrl: c.thumbnailKey ? this.mediaUrl(c.thumbnailKey) : null,
        templateId: c.templateId,
        captionVariants: (c.captionVariants ?? {}) as CaptionVariants,
        aiLabeled: c.aiLabeled,
        mcmcCertified: c.mcmcCertified,
        publishedAt,
        personalizedUrl: render?.cachedUrl ?? null,
        personalizedVideoUrl: render?.cachedVideoUrl ?? null,
        videoDurationSec: c.videoDurationSec ?? null,
        isNew: Date.now() - new Date(publishedAt).getTime() < NEW_WINDOW_MS,
        isBreaking: c.isBreaking,
        orgUnitName: c.targetOrgUnit?.name ?? null,
        createdAt: c.createdAt.toISOString(),
      } satisfies FeedItem;
    });
  }

  async getItem(userId: string, creativeId: string): Promise<FeedItem | null> {
    const items = await this.getFeed(userId);
    return items.find((i) => i.creativeId === creativeId) ?? null;
  }

  /** On-device render reports its result here; optional image/video dataUrls are cached. */
  async reportRender(
    userId: string,
    creativeId: string,
    input: { deviceTier: DeviceTier; dataUrl?: string; videoDataUrl?: string; usedServerFallback: boolean },
  ): Promise<PersonalizedRenderInfo> {
    let cachedUrl: string | null = null;
    let cachedVideoUrl: string | null = null;

    if (input.dataUrl) {
      const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(input.dataUrl);
      if (m) {
        const buffer = Buffer.from(m[2]!, "base64");
        const ext = m[1]!.split("/")[1] ?? "png";
        const { url } = await this.storage.put(`renders/${userId}/${creativeId}.${ext}`, buffer, m[1]!);
        cachedUrl = url;
      }
    }

    if (input.videoDataUrl) {
      const m = /^data:(video\/[a-z0-9;=, -]+);base64,(.+)$/i.exec(input.videoDataUrl);
      if (m) {
        const buffer = Buffer.from(m[2]!, "base64");
        // normalise mime to a safe file extension (webm or mp4)
        const ext = m[1]!.includes("mp4") ? "mp4" : "webm";
        const { url } = await this.storage.put(`renders/${userId}/${creativeId}_video.${ext}`, buffer, `video/${ext}`);
        cachedVideoUrl = url;
      }
    }

    const render = await this.prisma.personalizedRender.upsert({
      where: { userId_creativeId: { userId, creativeId } },
      create: {
        userId,
        creativeId,
        deviceTier: input.deviceTier,
        cachedUrl,
        cachedVideoUrl,
        usedServerFallback: input.usedServerFallback,
      },
      update: {
        deviceTier: input.deviceTier,
        ...(cachedUrl ? { cachedUrl } : {}),
        ...(cachedVideoUrl ? { cachedVideoUrl } : {}),
        usedServerFallback: input.usedServerFallback,
      },
    });
    return {
      creativeId,
      userId,
      deviceTier: render.deviceTier,
      cachedUrl: render.cachedUrl,
      usedServerFallback: render.usedServerFallback,
    };
  }

  /**
   * Server-side video personalization: native RN can't composite the banner onto
   * a video on-device, so the client uploads a banner PNG (rendered by the real
   * WorkerBanner component) and we overlay it with ffmpeg. Result is cached as
   * the worker's personalized video for this creative.
   */
  async renderPersonalizedVideo(
    userId: string,
    creativeId: string,
    bannerKey: string,
  ): Promise<{ videoUrl: string }> {
    const creative = await this.prisma.creative.findUnique({ where: { id: creativeId } });
    if (!creative) throw new NotFoundException("Creative not found.");
    if (creative.type !== "video") throw new BadRequestException("Creative is not a video.");

    const [videoBuf, bannerBuf] = await Promise.all([
      this.fetchBuffer(this.mediaUrl(creative.sourceKey)),
      this.fetchBuffer(this.mediaUrl(bannerKey)),
    ]);

    const outBuf = await overlayBannerOnVideo(videoBuf, bannerBuf);
    const { url } = await this.storage.put(
      `renders/${userId}/${creativeId}_video.mp4`,
      outBuf,
      "video/mp4",
    );

    await this.prisma.personalizedRender.upsert({
      where: { userId_creativeId: { userId, creativeId } },
      create: { userId, creativeId, cachedVideoUrl: url, usedServerFallback: true },
      update: { cachedVideoUrl: url, usedServerFallback: true },
    });
    return { videoUrl: url };
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Could not fetch media (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async getMyRenders(userId: string) {
    const renders = await this.prisma.personalizedRender.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Fetch creative details separately
    const creativeIds = [...new Set(renders.map((r) => r.creativeId))];
    const creatives = await this.prisma.creative.findMany({
      where: { id: { in: creativeIds } },
      select: { id: true, title: true, type: true, sourceKey: true, thumbnailKey: true },
    });
    const creativeMap = new Map(creatives.map((c) => [c.id, c]));

    return renders.map((r) => {
      const c = creativeMap.get(r.creativeId);
      const sourceUrl = c ? this.mediaUrl(c.sourceKey) : "";
      const thumbnailUrl = c?.thumbnailKey ? this.mediaUrl(c.thumbnailKey) : sourceUrl;
      return {
        id: r.id,
        creativeId: r.creativeId,
        title: c?.title ?? "Creative",
        type: c?.type ?? "image",
        sourceUrl,
        thumbnailUrl,
        cachedUrl: r.cachedUrl,
        cachedVideoUrl: r.cachedVideoUrl,
        createdAt: r.createdAt,
      };
    });
  }
}
