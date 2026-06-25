import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateActivityDto {
  partyName: string;
  activityType: string;
  title: string;
  description: string;
  counterPoint: string;
  mediaUrl?: string;
  location?: string;
  occurredAt: string; // ISO string from client
}

@Injectable()
export class OppositionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Legacy OppositionItem methods ──────────────────────────────────────────

  async create(dto: { party: string; headline: string; details?: string }, createdById: string) {
    return this.prisma.oppositionItem.create({
      data: { party: dto.party, headline: dto.headline, details: dto.details ?? null, createdById },
    });
  }

  async list(limit = 30) {
    return this.prisma.oppositionItem.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async addResponse(id: string, trsResponse: string) {
    const item = await this.prisma.oppositionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Item not found");
    return this.prisma.oppositionItem.update({ where: { id }, data: { trsResponse } });
  }

  // ── OppositionActivity methods ─────────────────────────────────────────────

  async createActivity(dto: CreateActivityDto, createdById: string) {
    return this.prisma.oppositionActivity.create({
      data: {
        partyName: dto.partyName,
        activityType: dto.activityType,
        title: dto.title,
        description: dto.description,
        counterPoint: dto.counterPoint,
        mediaUrl: dto.mediaUrl ?? null,
        location: dto.location ?? null,
        occurredAt: new Date(dto.occurredAt),
        createdById,
      },
    });
  }

  async listActivities(params: {
    page: number;
    limit: number;
    partyName?: string;
    activityType?: string;
  }) {
    const { page, limit, partyName, activityType } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (partyName) where["partyName"] = partyName;
    if (activityType) where["activityType"] = activityType;

    const [items, total] = await Promise.all([
      this.prisma.oppositionActivity.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.oppositionActivity.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDailyBrief() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const activities = await this.prisma.oppositionActivity.findMany({
      where: { occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
    });

    // Group by activityType for summary counts
    const countByType: Record<string, number> = {};
    const countByParty: Record<string, number> = {};

    for (const a of activities) {
      countByType[a.activityType] = (countByType[a.activityType] ?? 0) + 1;
      countByParty[a.partyName] = (countByParty[a.partyName] ?? 0) + 1;
    }

    return {
      since: since.toISOString(),
      total: activities.length,
      countByType,
      countByParty,
      activities,
    };
  }
}
