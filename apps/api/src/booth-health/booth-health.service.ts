import { ForbiddenException, Injectable } from "@nestjs/common";
import { LEADER_ROLES, type Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Booth-health command dashboard — the leader's decision engine. Every metric
 * the platform already captures (voter marking, panna coverage, worker
 * activity, surveys, turnout) gets rolled up per booth and turned into a single
 * weakness score so a leader running 200 booths can see WHICH ones are failing
 * at a glance, worst-first. No new data — pure aggregation.
 */
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface BoothHealth {
  boothId: string;
  name: string;
  totalVoters: number;
  markedPct: number; // % of voters given a RYG status (canvassing progress)
  supportPct: number; // green / marked (sentiment among those contacted)
  pannaPct: number; // % of voters assigned to a worker (page-in-charge coverage)
  workers: number;
  activeWorkers: number; // active in the last 7 days
  surveys: number;
  votedPct: number; // election-day turnout, when relevant
  weaknessScore: number; // 0 (strong) .. 100 (failing) — sort key
  reasons: string[]; // human-readable "why weak"
}

@Injectable()
export class BoothHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  /** Resolve the set of booths the actor may see under an optional root unit. */
  private async scopedBooths(actor: AuthUser, orgUnitId?: string) {
    if (!this.isGlobal(actor.role) && !LEADER_ROLES.includes(actor.role)) {
      throw new ForbiddenException("Only leaders can view booth health.");
    }
    let rootIds: string[] | null = null;
    if (this.isGlobal(actor.role)) {
      rootIds = orgUnitId ? await this.org.getDescendantIds(orgUnitId) : null;
    } else {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      const subtree = await this.org.getDescendantIds(me.orgUnitId);
      if (orgUnitId && !subtree.includes(orgUnitId)) {
        throw new ForbiddenException("That unit is outside your area.");
      }
      rootIds = orgUnitId ? await this.org.getDescendantIds(orgUnitId) : subtree;
    }
    return this.prisma.orgUnit.findMany({
      where: { type: "booth", ...(rootIds ? { id: { in: rootIds } } : {}) },
      select: { id: true, name: true },
    });
  }

  async dashboard(actor: AuthUser, orgUnitId?: string) {
    const booths = await this.scopedBooths(actor, orgUnitId);
    const now = Date.now();

    const rows = await Promise.all(
      booths.map((b) => this.oneBooth(b.id, b.name, now)),
    );
    rows.sort((a, b) => b.weaknessScore - a.weaknessScore);

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalVoters += r.totalVoters;
        acc.marked += Math.round((r.markedPct / 100) * r.totalVoters);
        acc.pannaAssigned += Math.round((r.pannaPct / 100) * r.totalVoters);
        acc.activeWorkers += r.activeWorkers;
        acc.workers += r.workers;
        return acc;
      },
      { totalVoters: 0, marked: 0, pannaAssigned: 0, activeWorkers: 0, workers: 0 },
    );

    return {
      booths: rows,
      summary: {
        boothCount: rows.length,
        weak: rows.filter((r) => r.weaknessScore >= 60).length,
        totalVoters: totals.totalVoters,
        markedPct: totals.totalVoters ? Math.round((totals.marked / totals.totalVoters) * 100) : 0,
        pannaPct: totals.totalVoters
          ? Math.round((totals.pannaAssigned / totals.totalVoters) * 100)
          : 0,
        activeWorkers: totals.activeWorkers,
        workers: totals.workers,
      },
    };
  }

  private async oneBooth(boothId: string, name: string, now: number): Promise<BoothHealth> {
    const activeSince = new Date(now - ACTIVE_WINDOW_MS);
    const [total, marked, green, voted, pannaAssigned, workers, activeWorkers, surveys] =
      await Promise.all([
        this.prisma.voter.count({ where: { boothId } }),
        this.prisma.voter.count({ where: { boothId, votingStatus: { not: "unmarked" } } }),
        this.prisma.voter.count({ where: { boothId, votingStatus: "green" } }),
        this.prisma.voter.count({ where: { boothId, isVoted: true } }),
        this.prisma.pannaAssignment.count({ where: { boothId } }),
        this.prisma.user.count({ where: { orgUnitId: boothId } }),
        this.prisma.user.count({ where: { orgUnitId: boothId, lastActiveAt: { gte: activeSince } } }),
        this.prisma.voterSurvey.count({ where: { boothId } }),
      ]);

    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
    const markedPct = pct(marked, total);
    const supportPct = pct(green, marked);
    const pannaPct = pct(pannaAssigned, total);
    const votedPct = pct(voted, total);

    // Weakness scoring — each failing dimension adds points; higher = worse.
    // Weighted toward the two things that actually win booths: someone is
    // assigned to the voters (panna), and those voters are being worked (marked).
    const reasons: string[] = [];
    let score = 0;
    if (total === 0) {
      score = 100;
      reasons.push("no_voter_roll");
      return { boothId, name, totalVoters: 0, markedPct: 0, supportPct: 0, pannaPct: 0, workers, activeWorkers, surveys: 0, votedPct: 0, weaknessScore: 100, reasons };
    }
    if (pannaPct < 50) {
      score += Math.round((50 - pannaPct) * 0.7);
      reasons.push("low_panna_coverage");
    }
    if (markedPct < 40) {
      score += Math.round((40 - markedPct) * 0.6);
      reasons.push("low_canvassing");
    }
    if (activeWorkers === 0) {
      score += 25;
      reasons.push("no_active_workers");
    } else if (workers > 0 && activeWorkers / workers < 0.5) {
      score += 10;
      reasons.push("workers_going_quiet");
    }
    if (workers === 0) {
      score += 20;
      reasons.push("no_workers");
    }
    if (surveys === 0) {
      score += 5;
      reasons.push("no_surveys");
    }

    return {
      boothId,
      name,
      totalVoters: total,
      markedPct,
      supportPct,
      pannaPct,
      workers,
      activeWorkers,
      surveys,
      votedPct,
      weaknessScore: Math.min(100, score),
      reasons,
    };
  }
}
