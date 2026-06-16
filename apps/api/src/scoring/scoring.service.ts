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
import { PushService } from "../push/push.service";

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
    private readonly push: PushService,
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
    users: { id: string; name: string; photoUrl: string | null; tier: any; weeklyLeaguePoints: number; isVerified?: boolean }[],
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
      isVerified: u.isVerified ?? false,
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
      select: { id: true, name: true, photoUrl: true, tier: true, weeklyLeaguePoints: true, isVerified: true },
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

  /** The worker's weekly league: leagueTier-matched ~30-person pool with REAL promote/demote. */
  async getPool(userId: string): Promise<PoolView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const cohort = await this.prisma.user.findMany({
      where: { leagueTier: user.leagueTier },
      orderBy: [{ weeklyLeaguePoints: "desc" }, { lifetimeReputation: "desc" }],
      take: POOL.SIZE,
      select: { id: true, name: true, photoUrl: true, tier: true, weeklyLeaguePoints: true, isVerified: true },
    });
    const viewerIndex = cohort.findIndex((u) => u.id === userId);
    return {
      poolId: `${user.leagueTier}-${mondayOf().toISOString().slice(0, 10)}`,
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

  private static readonly TIER_ORDER: ReadonlyArray<string> = [
    "karyakarta",
    "sevak",
    "pramukh",
    "nayak",
    "ratna",
  ];

  /**
   * League rollover — the promote/demote the PoolCard has always displayed,
   * finally executed. Per leagueTier cohort, the ~30-person pool (top of the
   * cohort by weekly points) promotes its top PROMOTE_TOP scorers (>0 pts) one
   * league up and demotes its bottom DEMOTE_BOTTOM one league down. Workers
   * outside the pool are untouched. leagueTier is competition-only — the
   * reputation-derived `tier` (badges/labels) is never touched here.
   */
  async applyLeagueRollover(): Promise<{ promoted: number; demoted: number }> {
    const ORDER = ScoringService.TIER_ORDER;
    const week = mondayOf().toISOString().slice(0, 10);

    // Snapshot ALL cohorts first so a user moved by this rollover can never be
    // re-evaluated in their destination cohort within the same rollover.
    const everyone = await this.prisma.user.findMany({
      select: { id: true, leagueTier: true, weeklyLeaguePoints: true, lifetimeReputation: true },
    });
    const byCohort = new Map<string, typeof everyone>();
    for (const u of everyone) {
      const arr = byCohort.get(u.leagueTier) ?? [];
      arr.push(u);
      byCohort.set(u.leagueTier, arr);
    }

    const moves: { id: string; from: string; to: string; reason: string }[] = [];
    for (let t = 0; t < ORDER.length; t++) {
      const cohort = (byCohort.get(ORDER[t]!) ?? []).sort(
        (a, b) =>
          b.weeklyLeaguePoints - a.weeklyLeaguePoints ||
          b.lifetimeReputation - a.lifetimeReputation,
      );
      const pool = cohort.slice(0, POOL.SIZE);
      if (pool.length === 0) continue;

      if (t < ORDER.length - 1) {
        for (const u of pool.slice(0, POOL.PROMOTE_TOP)) {
          if (u.weeklyLeaguePoints > 0) {
            moves.push({ id: u.id, from: ORDER[t]!, to: ORDER[t + 1]!, reason: "league_promote" });
          }
        }
      }
      // Demotion only when the cohort actually filled a pool, never below floor.
      if (t > 0 && pool.length === POOL.SIZE) {
        for (const u of pool.slice(POOL.SIZE - POOL.DEMOTE_BOTTOM)) {
          moves.push({ id: u.id, from: ORDER[t]!, to: ORDER[t - 1]!, reason: "league_demote" });
        }
      }
    }

    for (const m of moves) {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: m.id }, data: { leagueTier: m.to as any } }),
        this.prisma.scoreEntry.create({
          data: {
            userId: m.id,
            reason: m.reason as any,
            points: 0,
            weeklyDelta: 0,
            lifetimeDelta: 0,
            meta: { from: m.from, to: m.to, week } as any,
          },
        }),
      ]);
    }

    return {
      promoted: moves.filter((m) => m.reason === "league_promote").length,
      demoted: moves.filter((m) => m.reason === "league_demote").length,
    };
  }

  /** Monday rollover: settle promotions/demotions, then open the new week at 0. */
  async runWeeklyRollover(): Promise<{ affected: number; promoted: number; demoted: number }> {
    const { promoted, demoted } = await this.applyLeagueRollover();
    const { affected } = await this.resetWeekly();
    return { affected, promoted, demoted };
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

  /**
   * Worker-of-the-Week: run Sunday 23:30 IST (before Monday reset clears weekly points).
   * For each OrgUnit with active members, finds the top scorer and creates a NewsItem.
   * Also pushes a personal notification to each winner.
   */
  async pickWorkerOfWeek(): Promise<{ winners: number }> {
    const push = this.push;
    const news = this.prisma;
    const units = await this.prisma.orgUnit.findMany({ select: { id: true, name: true } });
    let winners = 0;

    for (const unit of units) {
      const top = await this.prisma.user.findFirst({
        where: { orgUnitId: unit.id, weeklyLeaguePoints: { gt: 0 } },
        orderBy: { weeklyLeaguePoints: "desc" },
        select: { id: true, name: true, weeklyLeaguePoints: true },
      });
      if (!top) continue;

      const title = `🏆 ఈ వారం ${unit.name} TRS ఛాంపియన్: ${top.name}`;
      const body = `${top.name} ఈ వారం ${top.weeklyLeaguePoints} పాయింట్లు సాధించారు! మీకు అభినందనలు 🎉 #TRS #Kavitha`;

      await news.newsItem.create({
        data: {
          handle: "@WotW",
          title: title.slice(0, 500),
          body: body.slice(0, 3000),
          status: "published",
          publishedAt: new Date(),
          orgUnitId: unit.id,
        },
      });

      // Personal push to the winner
      void push.pushToUser(top.id, "🏆 " + title, "మీరు ఈ వారం నంబర్ 1! 🎉", { type: "worker_of_week" }).catch(() => undefined);
      winners++;
    }
    return { winners };
  }

  /**
   * Verified Worker cron: daily check. Workers are "verified" when they have had
   * ≥1 share AND ≥1 grievance filed in the last 30 days, OR ≥100 lifetime points.
   */
  async runVerification(): Promise<{ verified: number; unverified: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000);

    // Workers who share
    const sharers = await this.prisma.scoreEntry.findMany({
      where: { reason: "share", createdAt: { gte: thirtyDaysAgo } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const sharerIds = new Set(sharers.map((s) => s.userId));

    // Workers who filed grievances
    const filers = await this.prisma.grievance.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { filedById: true },
      distinct: ["filedById"],
    });
    const filerIds = new Set(filers.map((f) => f.filedById));

    // High-reputation workers (100+ lifetime)
    const highRep = await this.prisma.user.findMany({
      where: { lifetimeReputation: { gte: 100 } },
      select: { id: true },
    });
    const highRepIds = new Set(highRep.map((u) => u.id));

    // All workers
    const all = await this.prisma.user.findMany({
      where: { role: "worker" },
      select: { id: true, isVerified: true },
    });

    let verified = 0;
    let unverified = 0;
    for (const u of all) {
      const shouldVerify = highRepIds.has(u.id) || (sharerIds.has(u.id) && filerIds.has(u.id));
      if (shouldVerify && !u.isVerified) {
        await this.prisma.user.update({
          where: { id: u.id },
          data: { isVerified: true, verifiedAt: new Date() },
        });
        verified++;
      } else if (!shouldVerify && u.isVerified) {
        await this.prisma.user.update({
          where: { id: u.id },
          data: { isVerified: false, verifiedAt: null },
        });
        unverified++;
      }
    }
    return { verified, unverified };
  }
}
