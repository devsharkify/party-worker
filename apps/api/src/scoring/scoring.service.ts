import { Injectable } from "@nestjs/common";
import {
  applyDecay,
  nextTierProgress,
  POOL,
  SCORING,
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

/** IST (UTC+5:30, no DST) calendar-day key — streaks follow the worker's day. */
function istDayKey(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
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

    // Streak maintenance: the first POSITIVE activity of each IST day extends
    // (or restarts) the streak. The bonus rewards CONTINUING a streak (day 2+).
    // Decay/streak/fraud entries are bookkeeping, not worker activity.
    let streakDays = user.streakDays ?? 0;
    let streakBonus = 0;
    if (reason !== "decay" && reason !== "streak" && reason !== "fraud_reversal" && points > 0) {
      const now = new Date();
      const today = istDayKey(now);
      const prevKey = user.lastActiveAt ? istDayKey(user.lastActiveAt) : null;
      if (prevKey !== today) {
        const yesterday = istDayKey(new Date(now.getTime() - 24 * 3600_000));
        streakDays = prevKey === yesterday ? streakDays + 1 : 1;
        if (streakDays >= 2) streakBonus = SCORING.STREAK_PER_DAY;
      }
    }

    const weeklyDelta = reason === "decay" ? 0 : points;
    const lifetimeDelta = points;
    const newLifetime = Math.max(0, user.lifetimeReputation + lifetimeDelta + streakBonus);
    const newWeekly = Math.max(0, user.weeklyLeaguePoints + weeklyDelta + streakBonus);
    const tier = tierForReputation(newLifetime);

    const ops = [
      this.prisma.user.update({
        where: { id: userId },
        data: {
          lifetimeReputation: newLifetime,
          weeklyLeaguePoints: newWeekly,
          tier,
          lastActiveAt: new Date(),
          streakDays,
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
    ];
    if (streakBonus > 0) {
      ops.push(
        this.prisma.scoreEntry.create({
          data: {
            userId,
            reason: "streak",
            points: streakBonus,
            weeklyDelta: streakBonus,
            lifetimeDelta: streakBonus,
            meta: { streakDays } as any,
          },
        }),
      );
    }
    await this.prisma.$transaction(ops);

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

  // -------------------------------------------------------------------------
  // Maintenance — invoked by the admin endpoints and the daily interval.
  // -------------------------------------------------------------------------

  /** Reset every worker's weekly league points to 0 (start of a new league week). */
  async resetWeekly(): Promise<{ affected: number }> {
    const res = await this.prisma.user.updateMany({ data: { weeklyLeaguePoints: 0 } });
    return { affected: res.count };
  }

  /**
   * Decay lifetimeReputation for users inactive > INACTIVE_DAYS. Reduction uses
   * the shared applyDecay() weighted by whole weeks inactive; tier is recomputed
   * and a 'decay' ScoreEntry is recorded. Returns how many users were adjusted.
   */
  async applyDecayForInactive(): Promise<{ affected: number }> {
    const INACTIVE_DAYS = 7;
    const DAY_MS = 24 * 3600_000;
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * DAY_MS);

    const stale = await this.prisma.user.findMany({
      where: { lastActiveAt: { lt: cutoff }, lifetimeReputation: { gt: 0 } },
      select: { id: true, lifetimeReputation: true, lastActiveAt: true, tier: true },
    });

    let affected = 0;
    for (const u of stale) {
      const lastActive = u.lastActiveAt ?? cutoff;
      const inactiveWeeks = Math.floor((Date.now() - lastActive.getTime()) / (7 * DAY_MS));
      if (inactiveWeeks <= 0) continue;

      const decayed = applyDecay(u.lifetimeReputation, inactiveWeeks);
      const delta = decayed - u.lifetimeReputation; // negative
      if (delta === 0) continue;

      const tier = tierForReputation(decayed);
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: u.id },
          // lastActiveAt is intentionally NOT touched, so decay doesn't reset inactivity.
          data: { lifetimeReputation: decayed, tier },
        }),
        this.prisma.scoreEntry.create({
          data: {
            userId: u.id,
            reason: "decay",
            points: delta,
            weeklyDelta: 0,
            lifetimeDelta: delta,
            meta: { inactiveWeeks } as any,
          },
        }),
      ]);
      affected += 1;
    }
    return { affected };
  }
}
