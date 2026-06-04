import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { computeSharePoints } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import { APP_ENV, type Env } from "../config/env";
import { sha256 } from "../auth/crypto.util";

const CRAWLER_RE =
  /(WhatsApp|facebookexternalhit|Facebot|TelegramBot|Slackbot|Twitterbot|Discordbot|LinkedInBot|bot|crawler|spider|preview)/i;

@Injectable()
export class ReachService {
  private readonly log = new Logger("ReachService");
  /** Ephemeral per-day salts — never persisted, so dedup hashes are not reversible. */
  private readonly dailySalts = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  isCrawler(userAgent: string): boolean {
    return CRAWLER_RE.test(userAgent || "");
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private saltFor(day: string): string {
    let salt = this.dailySalts.get(day);
    if (!salt) {
      salt = randomBytes(16).toString("hex");
      this.dailySalts.set(day, salt);
      // forget older days so salts truly expire
      for (const k of this.dailySalts.keys()) if (k !== day) this.dailySalts.delete(k);
    }
    return salt;
  }

  /** Truncate to /24 (IPv4) or /48 (IPv6) before hashing — minimization for DPDP. */
  private truncateIp(ip: string): string {
    if (!ip) return "0";
    if (ip.includes(".")) {
      const parts = ip.split(".");
      parts[3] = "0";
      return parts.join(".");
    }
    return ip.split(":").slice(0, 3).join(":") + "::";
  }

  async resolveDestination(linkId: string): Promise<string | null> {
    const share = await this.prisma.shareEvent.findUnique({
      where: { trackedLinkId: linkId },
      include: { creative: true, user: true },
    });
    if (!share) return null;
    const render = await this.prisma.personalizedRender.findUnique({
      where: { userId_creativeId: { userId: share.userId, creativeId: share.creativeId } },
    });
    const key = share.creative.sourceKey;
    const sourceUrl = /^https?:\/\//.test(key) ? key : this.storage.publicUrl(key);
    return render?.cachedUrl ?? sourceUrl ?? this.env.WEB_APP_URL;
  }

  /**
   * Count one unique tap (deduped per device within the 24h day bucket), update the
   * reach aggregate, and award the reach-weighted delta to the worker.
   */
  async recordTap(
    linkId: string,
    ip: string,
    userAgent: string,
  ): Promise<{ counted: boolean }> {
    const share = await this.prisma.shareEvent.findUnique({
      where: { trackedLinkId: linkId },
    });
    if (!share) return { counted: false };

    const day = this.today();
    const dedupHash = sha256(`${this.saltFor(day)}|${this.truncateIp(ip)}|${userAgent}|${linkId}`);

    try {
      await this.prisma.reachHit.create({
        data: { trackedLinkId: linkId, shareEventId: share.id, dedupHash, day },
      });
    } catch {
      // unique violation => same device already counted today
      return { counted: false };
    }

    const reach = await this.prisma.reachEvent.upsert({
      where: { shareEventId_source: { shareEventId: share.id, source: "whatsapp_link" } },
      create: {
        shareEventId: share.id,
        trackedLinkId: linkId,
        source: "whatsapp_link",
        uniqueCount: 1,
      },
      update: { uniqueCount: { increment: 1 } },
    });

    await this.awardReachDelta(share.userId, share.id, reach.uniqueCount, share.basePointsAwarded);
    return { counted: true };
  }

  /** Award only the increment so total share points track computeSharePoints(reach), capped. */
  private async awardReachDelta(
    userId: string,
    shareEventId: string,
    reach: number,
    awardedSoFar: number,
  ): Promise<void> {
    const target = Math.round(computeSharePoints(reach));
    const delta = target - awardedSoFar;
    if (delta <= 0) return;
    await this.scoring.award(userId, "share", delta, { shareEventId, reach });
    await this.prisma.shareEvent.update({
      where: { id: shareEventId },
      data: { basePointsAwarded: target },
    });
  }
}
