import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface HeatmapRow {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitType: string;
  parentId: string | null;
  totalReach: number;
  totalShares: number;
}

export interface TopCreativeRow {
  creativeId: string;
  title: string;
  totalReach: number;
  totalShares: number;
  publishedAt: Date | null;
}

export interface ReachByPlatform {
  platform: string;
  count: number;
}

export interface MyAnalytics {
  totalShares: number;
  totalReach: number;
  totalPoints: number;
  bestCreative: { title: string; reach: number } | null;
  reachByPlatform: ReachByPlatform[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate total ReachEvent.uniqueCount per OrgUnit at the given level.
   * Each OrgUnit's reach is the sum of uniqueCount across all ReachEvents
   * whose parent ShareEvent.user lives in that unit.
   */
  async getHeatmap(orgUnitType = "constituency"): Promise<HeatmapRow[]> {
    // Fetch all units of the requested type
    const units = await this.prisma.orgUnit.findMany({
      where: { type: orgUnitType as never },
      select: { id: true, name: true, type: true, parentId: true },
    });

    if (units.length === 0) return [];

    // Get user ids grouped by orgUnitId for those units
    const unitIds = units.map((u) => u.id);

    // Group users by orgUnitId
    const usersByUnit = await this.prisma.user.groupBy({
      by: ["orgUnitId"],
      where: { orgUnitId: { in: unitIds } },
      _count: { _all: true },
    });

    // Collect all user ids per unit (we need user ids to look up share events)
    const usersByUnitMap = new Map<string, string[]>();
    for (const unitId of unitIds) {
      usersByUnitMap.set(unitId, []);
    }

    const usersInUnits = await this.prisma.user.findMany({
      where: { orgUnitId: { in: unitIds } },
      select: { id: true, orgUnitId: true },
    });
    for (const u of usersInUnits) {
      const arr = usersByUnitMap.get(u.orgUnitId);
      if (arr) arr.push(u.id);
    }

    // For each unit, aggregate reach and shares
    const results: HeatmapRow[] = await Promise.all(
      units.map(async (unit) => {
        const memberIds = usersByUnitMap.get(unit.id) ?? [];

        if (memberIds.length === 0) {
          return {
            orgUnitId: unit.id,
            orgUnitName: unit.name,
            orgUnitType: unit.type,
            parentId: unit.parentId,
            totalReach: 0,
            totalShares: 0,
          };
        }

        const [reachAgg, shareCount] = await Promise.all([
          this.prisma.reachEvent.aggregate({
            where: { shareEvent: { userId: { in: memberIds } } },
            _sum: { uniqueCount: true },
          }),
          this.prisma.shareEvent.count({ where: { userId: { in: memberIds } } }),
        ]);

        return {
          orgUnitId: unit.id,
          orgUnitName: unit.name,
          orgUnitType: unit.type,
          parentId: unit.parentId,
          totalReach: reachAgg._sum.uniqueCount ?? 0,
          totalShares: shareCount,
        };
      }),
    );

    return results.sort((a, b) => b.totalReach - a.totalReach);
  }

  /**
   * Ranked creatives by total reach across all share events.
   */
  async getTopCreatives(limit = 10): Promise<TopCreativeRow[]> {
    // Get all creatives with their share events and reach events
    const creatives = await this.prisma.creative.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        shareEvents: {
          select: {
            reachEvents: {
              select: { uniqueCount: true },
            },
          },
        },
      },
    });

    const rows: TopCreativeRow[] = creatives.map((c) => {
      let totalReach = 0;
      let totalShares = 0;
      for (const se of c.shareEvents) {
        totalShares++;
        for (const re of se.reachEvents) {
          totalReach += re.uniqueCount;
        }
      }
      return {
        creativeId: c.id,
        title: c.title,
        totalReach,
        totalShares,
        publishedAt: c.publishedAt,
      };
    });

    return rows.sort((a, b) => b.totalReach - a.totalReach).slice(0, limit);
  }

  /**
   * Per-user analytics for the caller.
   */
  async getMyAnalytics(userId: string): Promise<MyAnalytics> {
    const [user, shareEvents, pointsAgg] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { lifetimeReputation: true },
      }),
      this.prisma.shareEvent.findMany({
        where: { userId },
        select: {
          channel: true,
          creativeId: true,
          creative: { select: { title: true } },
          reachEvents: { select: { uniqueCount: true } },
        },
      }),
      this.prisma.scoreEntry.aggregate({
        where: { userId },
        _sum: { lifetimeDelta: true },
      }),
    ]);

    const totalShares = shareEvents.length;
    let totalReach = 0;

    // Aggregate reach per creative for bestCreative
    const reachByCreative = new Map<string, { title: string; reach: number }>();
    // Aggregate reach by platform (channel)
    const reachByChannel = new Map<string, number>();

    for (const se of shareEvents) {
      let shareReach = 0;
      for (const re of se.reachEvents) {
        totalReach += re.uniqueCount;
        shareReach += re.uniqueCount;
      }

      // Accumulate per creative
      const existing = reachByCreative.get(se.creativeId);
      if (existing) {
        existing.reach += shareReach;
      } else {
        reachByCreative.set(se.creativeId, {
          title: se.creative.title,
          reach: shareReach,
        });
      }

      // Accumulate per channel (normalize to platform name)
      const platform = channelToPlatform(se.channel);
      reachByChannel.set(platform, (reachByChannel.get(platform) ?? 0) + shareReach);
    }

    // Best creative by reach
    let bestCreative: { title: string; reach: number } | null = null;
    for (const entry of reachByCreative.values()) {
      if (!bestCreative || entry.reach > bestCreative.reach) {
        bestCreative = entry;
      }
    }

    const reachByPlatform: ReachByPlatform[] = Array.from(reachByChannel.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalShares,
      totalReach,
      totalPoints: user.lifetimeReputation,
      bestCreative,
      reachByPlatform,
    };
  }
}

/** Map ShareChannel enum value to a human-readable platform name. */
function channelToPlatform(channel: string): string {
  if (channel.startsWith("whatsapp")) return "whatsapp";
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel === "youtube") return "youtube";
  if (channel === "x") return "x";
  return "other";
}
