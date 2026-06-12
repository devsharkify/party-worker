import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import type { AuthUser } from "../auth/auth.types";
import type {
  ChildUnitStat,
  InactiveMember,
  TeamStats,
  TeamTier,
  TeamTierCounts,
  TeamTopPerformer,
} from "./teamstats.types";

/** Roles that may view team dashboards (mirrors @pw/shared LEADER_ROLES, kept local). */
const LEADER_ROLES: Role[] = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
];

const ALL_TIERS: TeamTier[] = ["karyakarta", "sevak", "pramukh", "nayak", "ratna"];

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TeamStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  /** HQ/state see everything; everyone else is scoped to their own subtree. */
  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  /**
   * Resolve the unit to report on and enforce authorization.
   * - Defaults to the caller's own orgUnitId when unitId is omitted.
   * - Global admins may query any unit.
   * - Other callers must be leaders AND the unit must lie within their subtree.
   */
  private async resolveUnitId(caller: AuthUser, unitId?: string): Promise<string> {
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: caller.id },
      select: { orgUnitId: true },
    });
    const target = unitId ?? me.orgUnitId;

    if (this.isGlobal(caller.role)) return target;

    if (!LEADER_ROLES.includes(caller.role)) {
      throw new ForbiddenException("Only leaders can view team stats.");
    }
    const subtree = await this.org.getDescendantIds(me.orgUnitId);
    if (!subtree.includes(target)) {
      throw new ForbiddenException("You can only view units within your own area.");
    }
    return target;
  }

  async getTeamStats(caller: AuthUser, unitId?: string): Promise<TeamStats> {
    const targetUnitId = await this.resolveUnitId(caller, unitId);

    // Subtree rooted at the target unit (inclusive) and the members within it.
    const ids = await this.org.getDescendantIds(targetUnitId);
    const memberWhere = { orgUnitId: { in: ids } };
    const sevenDaysAgo = new Date(Date.now() - ACTIVE_WINDOW_MS);

    const [
      unit,
      memberCount,
      activeMembers,
      membersWithMembership,
      pointsAgg,
      tierGroups,
      topRows,
      memberIdRows,
      childUnits,
    ] = await Promise.all([
      this.prisma.orgUnit.findUniqueOrThrow({
        where: { id: targetUnitId },
        select: { name: true },
      }),
      this.prisma.user.count({ where: memberWhere }),
      this.prisma.user.count({
        where: { ...memberWhere, lastActiveAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.user.count({
        where: { ...memberWhere, membershipActive: true },
      }),
      this.prisma.user.aggregate({
        where: memberWhere,
        _sum: { weeklyLeaguePoints: true, lifetimeReputation: true },
      }),
      this.prisma.user.groupBy({
        by: ["tier"],
        where: memberWhere,
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: memberWhere,
        orderBy: [{ weeklyLeaguePoints: "desc" }],
        take: 5,
        select: { id: true, name: true, tier: true, weeklyLeaguePoints: true },
      }),
      this.prisma.user.findMany({ where: memberWhere, select: { id: true } }),
      this.childUnitStats(targetUnitId, sevenDaysAgo),
    ]);

    const memberIds = memberIdRows.map((u) => u.id);

    // Reach + shares attributed to those members. ReachEvent links to a member via
    // its parent ShareEvent.userId; shares are simply the member's ShareEvents.
    const [reachAgg, totalShares] = await Promise.all([
      memberIds.length
        ? this.prisma.reachEvent.aggregate({
            where: { shareEvent: { userId: { in: memberIds } } },
            _sum: { uniqueCount: true },
          })
        : Promise.resolve({ _sum: { uniqueCount: 0 } }),
      memberIds.length
        ? this.prisma.shareEvent.count({ where: { userId: { in: memberIds } } })
        : Promise.resolve(0),
    ]);

    const byTier: TeamTierCounts = {
      karyakarta: 0,
      sevak: 0,
      pramukh: 0,
      nayak: 0,
      ratna: 0,
    };
    for (const g of tierGroups) {
      const tier = g.tier as TeamTier;
      if (ALL_TIERS.includes(tier)) byTier[tier] = g._count._all;
    }

    const topPerformers: TeamTopPerformer[] = topRows.map((u) => ({
      userId: u.id,
      name: u.name,
      tier: u.tier as TeamTier,
      weeklyLeaguePoints: u.weeklyLeaguePoints,
    }));

    return {
      unitId: targetUnitId,
      unitName: unit.name,
      memberCount,
      activeMembers,
      membersWithMembership,
      totalWeeklyPoints: pointsAgg._sum.weeklyLeaguePoints ?? 0,
      totalLifetime: pointsAgg._sum.lifetimeReputation ?? 0,
      totalReach: reachAgg._sum.uniqueCount ?? 0,
      totalShares,
      byTier,
      topPerformers,
      childUnits,
    };
  }

  /** Direct child units of the target, each rolled up over its own subtree. */
  private async childUnitStats(targetUnitId: string, activeSince: Date): Promise<ChildUnitStat[]> {
    const children = await this.prisma.orgUnit.findMany({
      where: { parentId: targetUnitId },
      select: { id: true, name: true, type: true },
    });
    if (children.length === 0) return [];

    // Attribute every member in the combined subtree to the child whose
    // subtree contains their unit, then aggregate in one pass.
    const unitToChild = new Map<string, string>();
    await Promise.all(
      children.map(async (c) => {
        for (const id of await this.org.getDescendantIds(c.id)) unitToChild.set(id, c.id);
      }),
    );
    const members = await this.prisma.user.findMany({
      where: { orgUnitId: { in: [...unitToChild.keys()] } },
      select: { orgUnitId: true, lastActiveAt: true, weeklyLeaguePoints: true },
    });

    const agg = new Map(children.map((c) => [c.id, { members: 0, active: 0, points: 0 }]));
    for (const u of members) {
      const childId = unitToChild.get(u.orgUnitId);
      if (!childId) continue;
      const a = agg.get(childId)!;
      a.members += 1;
      a.points += u.weeklyLeaguePoints;
      if (u.lastActiveAt && u.lastActiveAt >= activeSince) a.active += 1;
    }

    return children
      .map((c) => {
        const a = agg.get(c.id)!;
        return {
          unitId: c.id,
          unitName: c.name,
          unitType: c.type,
          memberCount: a.members,
          activeMembers: a.active,
          weeklyPoints: a.points,
        };
      })
      .sort((x, y) => y.weeklyPoints - x.weeklyPoints || y.activeMembers - x.activeMembers);
  }

  /**
   * Members in the subtree idle for `days`+ (or never active), most-idle first.
   * The leader's Monday call list.
   */
  async getInactiveMembers(caller: AuthUser, unitId?: string, days = 7): Promise<InactiveMember[]> {
    const targetUnitId = await this.resolveUnitId(caller, unitId);
    const ids = await this.org.getDescendantIds(targetUnitId);
    const DAY_MS = 24 * 3600_000;
    const cutoff = new Date(Date.now() - Math.max(1, days) * DAY_MS);

    const rows = await this.prisma.user.findMany({
      where: {
        orgUnitId: { in: ids },
        OR: [{ lastActiveAt: { lt: cutoff } }, { lastActiveAt: null }],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        designation: true,
        lastActiveAt: true,
        createdAt: true,
        orgUnit: { select: { name: true } },
      },
      orderBy: [{ lastActiveAt: { sort: "asc", nulls: "first" } }],
      take: 200,
    });

    return rows.map((u) => ({
      userId: u.id,
      name: u.name,
      phone: u.phone,
      designation: u.designation,
      unitName: u.orgUnit.name,
      daysIdle: Math.floor((Date.now() - (u.lastActiveAt ?? u.createdAt).getTime()) / DAY_MS),
      lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
    }));
  }
}
