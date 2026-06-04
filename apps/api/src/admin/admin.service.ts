import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminGrievanceRow,
  AdminStats,
  GrievanceStatus,
  Tier,
} from "@pw/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  /** Aggregate dashboard numbers for HQ/state admins. */
  async getStats(): Promise<AdminStats> {
    const [
      workers,
      membersActive,
      creativesTotal,
      creativesPublished,
      mcmcCertified,
      totalShares,
      reachAgg,
      events,
      top,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { role: "worker" } }),
      this.prisma.user.count({ where: { membershipActive: true } }),
      this.prisma.creative.count(),
      this.prisma.creative.count({ where: { published: true } }),
      this.prisma.creative.count({ where: { published: true, mcmcCertified: true } }),
      this.prisma.shareEvent.count(),
      this.prisma.reachEvent.aggregate({ _sum: { uniqueCount: true } }),
      this.prisma.event.count(),
      this.prisma.user.findMany({
        orderBy: [{ weeklyLeaguePoints: "desc" }, { lifetimeReputation: "desc" }],
        take: 5,
        select: { id: true, name: true, tier: true, weeklyLeaguePoints: true },
      }),
    ]);

    // groupBy is run outside the transaction tuple so its element type isn't
    // widened into a union (which loses the _count._all shape).
    const grievanceGroups = await this.prisma.grievance.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    });

    // Seed every status to 0 so the shape is stable, then fill from groupBy.
    const grievances: Record<GrievanceStatus, number> = {
      open: 0,
      routed: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };
    for (const g of grievanceGroups) {
      grievances[g.status as GrievanceStatus] = g._count._all;
    }

    return {
      workers,
      membersActive,
      creativesTotal,
      creativesPublished,
      mcmcCertified,
      totalShares,
      totalReach: reachAgg._sum.uniqueCount ?? 0,
      grievances: {
        ...grievances,
        open: grievances.open,
        inProgress: grievances.in_progress,
        resolved: grievances.resolved,
      },
      events,
      topPerformers: top.map((u) => ({
        userId: u.id,
        name: u.name,
        tier: u.tier as Tier,
        weeklyLeaguePoints: u.weeklyLeaguePoints,
      })),
    };
  }

  /** All grievances (optionally filtered by status), newest first, with filer info. */
  async listGrievances(status?: GrievanceStatus): Promise<AdminGrievanceRow[]> {
    const where: Prisma.GrievanceWhereInput = status ? { status } : {};
    const rows = await this.prisma.grievance.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        filedBy: { select: { name: true, orgUnit: { select: { name: true } } } },
      },
    });
    return rows.map((g) => ({
      id: g.id,
      title: g.title,
      category: g.category,
      description: g.description,
      citizenName: g.citizenName,
      citizenPhone: g.citizenPhone,
      location: g.location,
      status: g.status as GrievanceStatus,
      createdAt: g.createdAt.toISOString(),
      filedByName: g.filedBy?.name ?? "Unknown",
      boothName: g.filedBy?.orgUnit?.name ?? null,
    }));
  }

  /** Update a grievance's workflow status; stamps resolvedAt on resolve. */
  async updateGrievanceStatus(
    id: string,
    status: GrievanceStatus,
  ): Promise<AdminGrievanceRow> {
    const existing = await this.prisma.grievance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Grievance not found");

    const updated = await this.prisma.grievance.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "resolved" ? (existing.resolvedAt ?? new Date()) : null,
      },
      include: {
        filedBy: { select: { name: true, orgUnit: { select: { name: true } } } },
      },
    });
    return {
      id: updated.id,
      title: updated.title,
      category: updated.category,
      description: updated.description,
      citizenName: updated.citizenName,
      citizenPhone: updated.citizenPhone,
      location: updated.location,
      status: updated.status as GrievanceStatus,
      createdAt: updated.createdAt.toISOString(),
      filedByName: updated.filedBy?.name ?? "Unknown",
      boothName: updated.filedBy?.orgUnit?.name ?? null,
    };
  }

  resetWeekly() {
    return this.scoring.resetWeekly();
  }

  applyDecay() {
    return this.scoring.applyDecayForInactive();
  }
}
