import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminGrievanceRow,
  AdminStats,
  AdminUserRow,
  AdminUpdateUserDto,
  NewsItem,
  GrievanceStatus,
  OrgUnitType,
  Role,
  Tier,
} from "@pw/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { PushService } from "../push/push.service";
import { OrgService } from "../org/org.service";
import { LEADER_ROLES } from "@pw/shared";

/** Human-readable labels for push notification bodies (mirrors admin UI). */
const ROLE_LABELS: Record<string, string> = {
  worker: "Worker",
  booth_leader: "Booth Leader",
  mandal_leader: "Mandal Leader / Ward Leader",
  constituency_leader: "Constituency Leader",
  district_leader: "District Leader",
  state_admin: "State Admin",
  hq_admin: "HQ Admin",
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly push: PushService,
    private readonly org: OrgService,
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

  private toUserRow(u: any): AdminUserRow {
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      photoUrl: u.photoUrl ?? null,
      role: u.role as Role,
      tier: u.tier as Tier,
      designation: u.designation ?? null,
      orgUnitId: u.orgUnitId,
      orgUnitName: u.orgUnit?.name ?? "",
      orgUnitType: (u.orgUnit?.type ?? "booth") as OrgUnitType,
      isLeader: LEADER_ROLES.includes(u.role as Role),
      lifetimeReputation: u.lifetimeReputation,
      weeklyLeaguePoints: u.weeklyLeaguePoints,
      membershipActive: u.membershipActive,
      createdAt: u.createdAt.toISOString(),
    };
  }

  /** List users with optional search/filter */
  async listUsers(opts: { search?: string; role?: string; orgUnitId?: string }): Promise<AdminUserRow[]> {
    const where: Prisma.UserWhereInput = {};
    if (opts.search?.trim()) {
      const s = opts.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { phone: { contains: s } },
      ];
    }
    if (opts.role) where.role = opts.role as Role;
    if (opts.orgUnitId) {
      // Include subtree
      const ids = await this.getSubtreeIds(opts.orgUnitId);
      where.orgUnitId = { in: ids };
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { orgUnit: { select: { name: true, type: true } } },
      take: 200,
    });

    return users.map((u) => this.toUserRow(u));
  }

  private async getSubtreeIds(rootId: string): Promise<string[]> {
    const all = await this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();
    for (const u of all) {
      if (u.parentId) {
        if (!children.has(u.parentId)) children.set(u.parentId, []);
        children.get(u.parentId)!.push(u.id);
      }
    }
    const result: string[] = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      result.push(id);
      queue.push(...(children.get(id) ?? []));
    }
    return result;
  }

  /** Admin update: role, orgUnit, name, designation */
  async updateUser(id: string, dto: AdminUpdateUserDto): Promise<AdminUserRow> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
      },
      include: { orgUnit: { select: { name: true, type: true } } },
    });

    // Send a push notification when a user is appointed to a leader role.
    if (dto.role !== undefined && LEADER_ROLES.includes(dto.role as Role)) {
      const roleName = ROLE_LABELS[dto.role] ?? dto.role;
      try {
        await this.push.pushToUser(
          id,
          "మీరు నియమితులయ్యారు! (You've been appointed!)",
          `మీరు ఇప్పుడు పార్టీలో ${roleName}. మీ టీమ్‌ను నిర్వహించడానికి యాప్ తెరవండి.`,
          { type: "role_change", role: dto.role },
        );
      } catch {
        // Non-fatal: push delivery failure must not block the update response.
      }
    }

    return this.toUserRow(updated);
  }

  /** Create a news item */
  async createNews(dto: { title: string; body: string; imageUrl?: string | null; sourceUrl?: string | null; orgUnitId?: string }): Promise<NewsItem> {
    const item = await this.prisma.newsItem.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl ?? null,
        sourceUrl: dto.sourceUrl ?? null,
        orgUnitId: dto.orgUnitId ?? null,
        publishedAt: new Date(),
      },
      include: { orgUnit: { select: { name: true } } },
    });
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl ?? null,
      sourceUrl: item.sourceUrl ?? null,
      publishedAt: item.publishedAt.toISOString(),
      orgUnitId: item.orgUnitId ?? null,
      orgUnitName: item.orgUnit?.name ?? null,
    };
  }

  /** List all news items newest first */
  async listNews(): Promise<NewsItem[]> {
    const items = await this.prisma.newsItem.findMany({
      orderBy: { publishedAt: "desc" },
      include: { orgUnit: { select: { name: true } } },
      take: 100,
    });
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl ?? null,
      sourceUrl: item.sourceUrl ?? null,
      publishedAt: item.publishedAt.toISOString(),
      orgUnitId: item.orgUnitId ?? null,
      orgUnitName: item.orgUnit?.name ?? null,
    }));
  }

  /**
   * All org units (full tree, no role-scoping) — used by admin People section
   * so admins can reassign any user to any unit.
   */
  listOrgUnits() {
    return this.org.getTree();
  }
}
