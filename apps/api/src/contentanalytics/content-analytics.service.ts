import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ContentPerformanceRow,
  TopAmplifierRow,
} from "./content-analytics.types";

@Injectable()
export class ContentAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per published creative: share count, total verified unique reach, and
   * personalized-render count. Sorted by reach desc.
   *
   * Shares and renders come from a single groupBy each (cheap). Reach is summed
   * per creative via a relation filter on ReachEvent.shareEvent.creativeId so we
   * never have to load individual share/reach rows.
   */
  async contentPerformance(): Promise<ContentPerformanceRow[]> {
    const creatives = await this.prisma.creative.findMany({
      where: { published: true },
      select: { id: true, title: true, type: true },
    });
    if (creatives.length === 0) return [];

    const creativeIds = creatives.map((c) => c.id);

    const [shareGroups, renderGroups] = await Promise.all([
      this.prisma.shareEvent.groupBy({
        by: ["creativeId"],
        where: { creativeId: { in: creativeIds } },
        _count: { _all: true },
      }),
      this.prisma.personalizedRender.groupBy({
        by: ["creativeId"],
        where: { creativeId: { in: creativeIds } },
        _count: { _all: true },
      }),
    ]);

    const sharesByCreative = new Map<string, number>();
    for (const g of shareGroups) sharesByCreative.set(g.creativeId, g._count._all);

    const rendersByCreative = new Map<string, number>();
    for (const g of renderGroups) rendersByCreative.set(g.creativeId, g._count._all);

    // Reach is keyed off the share event's creative, so use a relation filter.
    const reachByCreative = new Map<string, number>();
    await Promise.all(
      creativeIds.map(async (creativeId) => {
        const agg = await this.prisma.reachEvent.aggregate({
          where: { shareEvent: { creativeId } },
          _sum: { uniqueCount: true },
        });
        reachByCreative.set(creativeId, agg._sum.uniqueCount ?? 0);
      }),
    );

    const rows: ContentPerformanceRow[] = creatives.map((c) => ({
      creativeId: c.id,
      title: c.title,
      type: c.type,
      shares: sharesByCreative.get(c.id) ?? 0,
      reach: reachByCreative.get(c.id) ?? 0,
      renders: rendersByCreative.get(c.id) ?? 0,
    }));

    rows.sort((a, b) => b.reach - a.reach);
    return rows;
  }

  /**
   * Top 10 workers by total verified reach. Reach is summed per share event,
   * then rolled up to the share event's owning user. Name/tier resolved from User.
   */
  async topAmplifiers(): Promise<TopAmplifierRow[]> {
    // Sum unique reach per share event (skip orphan reach with no share event).
    const reachByShare = await this.prisma.reachEvent.groupBy({
      by: ["shareEventId"],
      where: { shareEventId: { not: null } },
      _sum: { uniqueCount: true },
    });
    if (reachByShare.length === 0) return [];

    const shareEventIds = reachByShare
      .map((r) => r.shareEventId)
      .filter((id): id is string => id !== null);

    // Map each share event to its owning user (and count shares per user).
    const shareEvents = await this.prisma.shareEvent.findMany({
      where: { id: { in: shareEventIds } },
      select: { id: true, userId: true },
    });
    const userByShare = new Map<string, string>();
    for (const s of shareEvents) userByShare.set(s.id, s.userId);

    const reachByUser = new Map<string, number>();
    for (const r of reachByShare) {
      if (r.shareEventId === null) continue;
      const userId = userByShare.get(r.shareEventId);
      if (!userId) continue;
      reachByUser.set(userId, (reachByUser.get(userId) ?? 0) + (r._sum.uniqueCount ?? 0));
    }
    if (reachByUser.size === 0) return [];

    // Total share count per user (all of their share events, not only reached ones).
    const shareCountGroups = await this.prisma.shareEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: [...reachByUser.keys()] } },
      _count: { _all: true },
    });
    const sharesByUser = new Map<string, number>();
    for (const g of shareCountGroups) sharesByUser.set(g.userId, g._count._all);

    const topUserIds = [...reachByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId]) => userId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, name: true, tier: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return topUserIds.flatMap((userId) => {
      const u = userById.get(userId);
      if (!u) return [];
      return [
        {
          userId,
          name: u.name,
          tier: u.tier,
          reach: reachByUser.get(userId) ?? 0,
          shares: sharesByUser.get(userId) ?? 0,
        },
      ];
    });
  }
}
