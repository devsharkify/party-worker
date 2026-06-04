import { Injectable } from "@nestjs/common";
import {
  nextTierProgress,
  POOL,
  tierForReputation,
  type LeaderboardEntry,
  type LeaderboardView,
  type OrgUnitType,
  type PoolView,
  type ScoreReason,
  type ScoreSummary,
} from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";

function mondayOf(date = new Date()): Date {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface AwardResult {
  pointsAwarded: number;
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  tier: ReturnType<typeof tierForReputation>;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  /**
   * Award points. Most reasons add to BOTH weekly (leaderboard) and lifetime
   * (reputation/tier). Decay passes negative points and touches lifetime only.
   */
  async award(
    userId: string,
    reason: ScoreReason,
    points: number,
    meta?: Record<string, unknown>,
  ): Promise<AwardResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const weeklyDelta = reason === "decay" ? 0 : points;
    const lifetimeDelta = points;
    const newLifetime = Math.max(0, user.lifetimeReputation + lifetimeDelta);
    const newWeekly = Math.max(0, user.weeklyLeaguePoints + weeklyDelta);
    const tier = tierForReputation(newLifetime);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          lifetimeReputation: newLifetime,
          weeklyLeaguePoints: newWeekly,
          tier,
          lastActiveAt: new Date(),
        },
      }),
      this.prisma.scoreEntry.create({
        data: {
          userId,
          reason,
          points,
          weeklyDelta,
          lifetimeDelta,
          meta: (meta ?? undefined) as any,
        },
      }),
    ]);

    return { pointsAwarded: points, lifetimeReputation: newLifetime, weeklyLeaguePoints: newWeekly, tier };
  }

  private toEntries(
    users: { id: string; name: string; photoUrl: string | null; tier: any; weeklyLeaguePoints: number }[],
    viewerId: string,
  ): LeaderboardEntry[] {
    return users.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      name: u.name,
      photoUrl: u.photoUrl,
      tier: u.tier,
      points: u.weeklyLeaguePoints,
      isViewer: u.id === viewerId,
    }));
  }

  async getLeaderboard(userId: string, level: OrgUnitType): Promise<LeaderboardView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const target = await this.org.getAncestorAtLevel(user.orgUnitId, level);
    if (!target) {
      return { level, orgUnitId: "", orgUnitName: "", viewerRank: null, entries: [] };
    }
    const ids = await this.org.getDescendantIds(target.id);
    const top = await this.prisma.user.findMany({
      where: { orgUnitId: { in: ids } },
      orderBy: [{ weeklyLeaguePoints: "desc" }, { lifetimeReputation: "desc" }],
      take: 50,
      select: { id: true, name: true, photoUrl: true, tier: true, weeklyLeaguePoints: true },
    });
    const higher = await this.prisma.user.count({
      where: { orgUnitId: { in: ids }, weeklyLeaguePoints: { gt: user.weeklyLeaguePoints } },
    });
    return {
      level,
      orgUnitId: target.id,
      orgUnitName: target.name,
      viewerRank: higher + 1,
      entries: this.toEntries(top, userId),
    };
  }

  async getScoreSummary(userId: string): Promise<ScoreSummary> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const chain = await this.org.getAncestorChain(user.orgUnitId);
    const ranks: Partial<Record<OrgUnitType, number>> = {};
    for (const node of chain) {
      const ids = await this.org.getDescendantIds(node.id);
      const higher = await this.prisma.user.count({
        where: { orgUnitId: { in: ids }, weeklyLeaguePoints: { gt: user.weeklyLeaguePoints } },
      });
      ranks[node.type] = higher + 1;
    }
    const prog = nextTierProgress(user.lifetimeReputation);
    return {
      lifetimeReputation: user.lifetimeReputation,
      weeklyLeaguePoints: user.weeklyLeaguePoints,
      tier: user.tier,
      nextTier: prog.next,
      pointsToNextTier: prog.remaining,
      streakDays: user.streakDays,
      ranks,
    };
  }

  /** The worker's weekly league: tier-matched ~30-person pool, with promote/demote zones. */
  async getPool(userId: string): Promise<PoolView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const cohort = await this.prisma.user.findMany({
      where: { tier: user.tier },
      orderBy: [{ weeklyLeaguePoints: "desc" }, { lifetimeReputation: "desc" }],
      take: POOL.SIZE,
      select: { id: true, name: true, photoUrl: true, tier: true, weeklyLeaguePoints: true },
    });
    const viewerIndex = cohort.findIndex((u) => u.id === userId);
    return {
      poolId: `${user.tier}-${mondayOf().toISOString().slice(0, 10)}`,
      weekStart: mondayOf().toISOString(),
      size: POOL.SIZE,
      promoteTop: POOL.PROMOTE_TOP,
      demoteBottom: POOL.DEMOTE_BOTTOM,
      viewerRank: viewerIndex >= 0 ? viewerIndex + 1 : null,
      entries: this.toEntries(cohort, userId),
    };
  }
}
