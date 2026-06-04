import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

/**
 * Mirrors SCORING.RECRUIT_BONUS from @pw/shared. Kept local on purpose so the
 * recruits module stays self-contained (types are local here).
 */
const RECRUIT_BONUS = 25;

const DAY_MS = 24 * 3600_000;
/** A recruit (or recruiter) counts as "active" if seen within this window. */
const ACTIVE_DAYS = 7;
/** The second-half bonus only matures after the recruit has stuck around. */
const MATURE_DAYS = 14;
/** ...and only if the recruit is still active within this (looser) window. */
const RETENTION_DAYS = 30;

/** A single recruit, as surfaced to the recruiter on GET /me/recruits. */
export interface RecruitRow {
  id: string;
  name: string;
  role: string;
  recruitedAt: string | null;
  lastActiveAt: string | null;
  active: boolean;
  tenureDays: number;
}

export interface ProcessBonusResult {
  awarded: number;
}

@Injectable()
export class RecruitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  /** Whether `at` falls within the last `windowDays` days from `now`. */
  private isWithin(at: Date | null, windowDays: number, now: number): boolean {
    if (!at) return false;
    return now - at.getTime() <= windowDays * DAY_MS;
  }

  /** Whole days elapsed since `recruitedAt` (0 if unknown/future). */
  private tenureDays(recruitedAt: Date | null, now: number): number {
    if (!recruitedAt) return 0;
    return Math.max(0, Math.floor((now - recruitedAt.getTime()) / DAY_MS));
  }

  /** People this user has personally brought into the network, newest first. */
  async listForRecruiter(recruiterId: string): Promise<RecruitRow[]> {
    const now = Date.now();
    const recruits = await this.prisma.user.findMany({
      where: { recruitedById: recruiterId },
      orderBy: [{ recruitedAt: "desc" }],
      select: {
        id: true,
        name: true,
        role: true,
        recruitedAt: true,
        lastActiveAt: true,
      },
    });

    return recruits.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      recruitedAt: u.recruitedAt ? u.recruitedAt.toISOString() : null,
      lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
      active: this.isWithin(u.lastActiveAt, ACTIVE_DAYS, now),
      tenureDays: this.tenureDays(u.recruitedAt, now),
    }));
  }

  /**
   * The delayed, second-half recruit reward. For every recruit who has matured
   * (recruited >= 14 days ago) and stuck around (active within 30 days), award
   * their recruiter the bonus once. Idempotent: existing 'recruit_bonus'
   * entries are loaded and filtered in JS by meta.recruitedUserId so re-running
   * never double-pays.
   */
  async processBonus(): Promise<ProcessBonusResult> {
    const now = Date.now();
    const maturedBefore = new Date(now - MATURE_DAYS * DAY_MS);
    const activeAfter = new Date(now - RETENTION_DAYS * DAY_MS);

    const eligible = await this.prisma.user.findMany({
      where: {
        recruitedById: { not: null },
        recruitedAt: { lte: maturedBefore },
        lastActiveAt: { gte: activeAfter },
      },
      select: { id: true, recruitedById: true },
    });
    if (eligible.length === 0) return { awarded: 0 };

    // Dedupe: pull every recruit_bonus entry and collect the recruits already
    // paid for. Prisma's Json filtering is backend-specific, so filter in JS.
    const priorBonuses = await this.prisma.scoreEntry.findMany({
      where: { reason: "recruit_bonus" },
      select: { meta: true },
    });
    const alreadyPaid = new Set<string>();
    for (const entry of priorBonuses) {
      const meta = entry.meta as { recruitedUserId?: unknown } | null;
      const recruitedUserId = meta?.recruitedUserId;
      if (typeof recruitedUserId === "string") alreadyPaid.add(recruitedUserId);
    }

    let awarded = 0;
    for (const recruit of eligible) {
      if (!recruit.recruitedById) continue;
      if (alreadyPaid.has(recruit.id)) continue;

      await this.scoring.award(
        recruit.recruitedById,
        // `recruit_bonus` is a valid ScoreReason; cast keeps types local.
        "recruit_bonus" as Parameters<ScoringService["award"]>[1],
        RECRUIT_BONUS,
        { recruitedUserId: recruit.id },
      );
      // Guard against the same recruiter/recruit appearing twice in one run.
      alreadyPaid.add(recruit.id);
      awarded += 1;
    }

    return { awarded };
  }
}
