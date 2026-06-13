import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

export interface MissionView {
  id: string;
  title: string;
  caption: string | null;
  hashtag: string | null;
  bonusPoints: number;
  startsAt: string;
  endsAt: string;
  creativeId: string | null;
  completedByViewer: boolean;
  completionCount: number;
}

export interface CreateMissionInput {
  title: string;
  caption?: string;
  hashtag?: string;
  creativeId?: string;
  bonusPoints: number;
  startsAt: string;
  endsAt: string;
  createdById: string;
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  /** Active + upcoming missions visible to any worker. */
  async list(userId: string): Promise<MissionView[]> {
    const now = new Date();
    const missions = await this.prisma.mission.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      include: {
        completions: { select: { userId: true } },
      },
    });

    return missions.map((m) => ({
      id: m.id,
      title: m.title,
      caption: m.caption,
      hashtag: m.hashtag,
      bonusPoints: m.bonusPoints,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      creativeId: m.creativeId,
      completedByViewer: m.completions.some((c) => c.userId === userId),
      completionCount: m.completions.length,
    }));
  }

  /** Admin: list all missions (including expired). */
  async listAll(): Promise<MissionView[]> {
    const missions = await this.prisma.mission.findMany({
      orderBy: { startsAt: "desc" },
      include: { completions: { select: { userId: true } } },
    });
    return missions.map((m) => ({
      id: m.id,
      title: m.title,
      caption: m.caption,
      hashtag: m.hashtag,
      bonusPoints: m.bonusPoints,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      creativeId: m.creativeId,
      completedByViewer: false,
      completionCount: m.completions.length,
    }));
  }

  /** Admin: create a timed mission. */
  async create(input: CreateMissionInput): Promise<MissionView> {
    const m = await this.prisma.mission.create({
      data: {
        title: input.title,
        caption: input.caption ?? null,
        hashtag: input.hashtag ?? null,
        creativeId: input.creativeId ?? null,
        bonusPoints: input.bonusPoints,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        createdById: input.createdById,
      },
      include: { completions: { select: { userId: true } } },
    });
    return {
      id: m.id,
      title: m.title,
      caption: m.caption,
      hashtag: m.hashtag,
      bonusPoints: m.bonusPoints,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      creativeId: m.creativeId,
      completedByViewer: false,
      completionCount: 0,
    };
  }

  /**
   * Record mission completion + award bonus if:
   * - mission window is active
   * - user hasn't completed it yet
   * Returns points awarded (0 if already done or window closed).
   */
  async complete(userId: string, missionId: string): Promise<{ pointsAwarded: number }> {
    const mission = await this.prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission) return { pointsAwarded: 0 };

    const now = new Date();
    if (now < mission.startsAt || now > mission.endsAt) {
      return { pointsAwarded: 0 };
    }

    const existing = await this.prisma.missionCompletion.findUnique({
      where: { missionId_userId: { missionId, userId } },
    });
    if (existing) return { pointsAwarded: 0 };

    await this.prisma.missionCompletion.create({ data: { missionId, userId } });
    await this.scoring.award(userId, "mission_bonus", mission.bonusPoints, { missionId });
    return { pointsAwarded: mission.bonusPoints };
  }

  /** Award mission bonus when a share confirms — checks all active missions. */
  async awardMissionBonusOnShare(userId: string, creativeId: string): Promise<void> {
    const now = new Date();
    const activeMissions = await this.prisma.mission.findMany({
      where: {
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [{ creativeId }, { creativeId: null }],
      },
    });

    for (const mission of activeMissions) {
      await this.complete(userId, mission.id);
    }
  }
}
