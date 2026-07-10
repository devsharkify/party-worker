import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LEADER_ROLES, type Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Panna (page-in-charge) assignment — the BJP-style spine that turns a generic
 * roster into "every worker owns 30-60 specific voters". A leader assigns booth
 * voters to a worker in their subtree; the worker's home becomes those voters.
 */
@Injectable()
export class PannaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  private isLeader(role: Role): boolean {
    return LEADER_ROLES.includes(role);
  }

  /** Leaders/HQ only; and the target worker must sit in the actor's subtree. */
  private async assertCanAssign(actor: AuthUser, worker: { orgUnitId: string }): Promise<void> {
    if (this.isGlobal(actor.role)) return;
    if (!this.isLeader(actor.role)) {
      throw new ForbiddenException("Only leaders can assign panna voters.");
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const subtree = await this.org.getDescendantIds(me.orgUnitId);
    if (!subtree.includes(worker.orgUnitId)) {
      throw new ForbiddenException("That worker is outside your area.");
    }
  }

  /**
   * Assign a set of voters to a worker. Voters must live in a booth inside the
   * actor's subtree. A voter already owned by someone else is reassigned
   * (one voter, one panna owner). Returns the count assigned.
   */
  async assign(actor: AuthUser, dto: { workerId: string; voterIds: string[] }) {
    if (!dto.workerId || !Array.isArray(dto.voterIds) || dto.voterIds.length === 0) {
      throw new BadRequestException("workerId and a non-empty voterIds array are required.");
    }
    if (dto.voterIds.length > 500) {
      throw new BadRequestException("Assign at most 500 voters at a time.");
    }
    const worker = await this.prisma.user.findUnique({ where: { id: dto.workerId } });
    if (!worker) throw new NotFoundException("Worker not found.");
    await this.assertCanAssign(actor, worker);

    // Clip requested voters to booths inside the actor's scope.
    const scopeIds = this.isGlobal(actor.role)
      ? null
      : new Set(
          await this.org.getDescendantIds(
            (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).orgUnitId,
          ),
        );
    const voters = await this.prisma.voter.findMany({
      where: {
        id: { in: dto.voterIds },
        ...(scopeIds ? { boothId: { in: [...scopeIds] } } : {}),
      },
      select: { id: true, boothId: true },
    });
    if (voters.length === 0) throw new BadRequestException("No assignable voters in your area.");

    await this.prisma.$transaction(
      voters.map((v) =>
        this.prisma.pannaAssignment.upsert({
          where: { voterId: v.id },
          create: {
            voterId: v.id,
            workerId: dto.workerId,
            boothId: v.boothId,
            assignedById: actor.id,
          },
          update: { workerId: dto.workerId, assignedById: actor.id },
        }),
      ),
    );
    return { assigned: voters.length };
  }

  /** Remove voters from any panna (leader action). */
  async unassign(actor: AuthUser, dto: { voterIds: string[] }) {
    if (!Array.isArray(dto.voterIds) || dto.voterIds.length === 0) {
      throw new BadRequestException("voterIds required.");
    }
    if (!this.isGlobal(actor.role) && !this.isLeader(actor.role)) {
      throw new ForbiddenException("Only leaders can unassign panna voters.");
    }
    const scopeIds = this.isGlobal(actor.role)
      ? null
      : new Set(
          await this.org.getDescendantIds(
            (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).orgUnitId,
          ),
        );
    const res = await this.prisma.pannaAssignment.deleteMany({
      where: {
        voterId: { in: dto.voterIds },
        ...(scopeIds ? { boothId: { in: [...scopeIds] } } : {}),
      },
    });
    return { removed: res.count };
  }

  /** The signed-in worker's own panna — their people, with live status. */
  async myPanna(actor: AuthUser) {
    const rows = await this.prisma.pannaAssignment.findMany({
      where: { workerId: actor.id },
      orderBy: [{ voter: { partNo: "asc" } }, { voter: { serialNo: "asc" } }],
      include: {
        voter: {
          select: {
            id: true,
            nameEn: true,
            nameTe: true,
            age: true,
            gender: true,
            houseNo: true,
            serialNo: true,
            partNo: true,
            mobile: true,
            votingStatus: true,
            isVoted: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });
    const voters = rows.map((r) => ({ ...r.voter, knowsPersonally: r.knowsPersonally }));
    return { total: voters.length, summary: this.summarise(voters), voters };
  }

  /** Compact counts for the "My Voters" header + leader dashboards. */
  private summarise(
    voters: Array<{ votingStatus: string; isVoted: boolean; knowsPersonally: boolean }>,
  ) {
    const s = { green: 0, yellow: 0, red: 0, unmarked: 0, voted: 0, known: 0 };
    for (const v of voters) {
      if (v.votingStatus in s) s[v.votingStatus as keyof typeof s]++;
      if (v.isVoted) s.voted++;
      if (v.knowsPersonally) s.known++;
    }
    return s;
  }

  /** Worker flags a voter in their own panna as someone they personally know. */
  async setKnowsPersonally(actor: AuthUser, voterId: string, knows: boolean) {
    const assignment = await this.prisma.pannaAssignment.findUnique({ where: { voterId } });
    if (!assignment || assignment.workerId !== actor.id) {
      throw new ForbiddenException("That voter is not in your panna.");
    }
    await this.prisma.pannaAssignment.update({
      where: { voterId },
      data: { knowsPersonally: knows },
    });
    return { voterId, knowsPersonally: knows };
  }

  /**
   * Leader view: per-worker panna coverage inside a booth (or their whole
   * subtree). Drives the "who has how many, and are they working them?" screen.
   */
  async coverage(actor: AuthUser, orgUnitId?: string) {
    if (!this.isGlobal(actor.role) && !this.isLeader(actor.role)) {
      throw new ForbiddenException("Only leaders can view panna coverage.");
    }
    let boothIds: string[] | null = null;
    if (this.isGlobal(actor.role)) {
      boothIds = orgUnitId ? await this.org.getDescendantIds(orgUnitId) : null;
    } else {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      const subtree = await this.org.getDescendantIds(me.orgUnitId);
      if (orgUnitId && !subtree.includes(orgUnitId)) {
        throw new ForbiddenException("That unit is outside your area.");
      }
      boothIds = orgUnitId ? await this.org.getDescendantIds(orgUnitId) : subtree;
    }

    const where = boothIds ? { boothId: { in: boothIds } } : {};
    const [totalVoters, assignedCount, grouped] = await Promise.all([
      this.prisma.voter.count({ where }),
      this.prisma.pannaAssignment.count({ where }),
      this.prisma.pannaAssignment.groupBy({
        by: ["workerId"],
        where,
        _count: { _all: true },
      }),
    ]);

    const workers = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.workerId) } },
      select: { id: true, name: true, phone: true, orgUnit: { select: { name: true } } },
    });
    const nameById = new Map(workers.map((w) => [w.id, w]));

    const perWorker = grouped
      .map((g) => {
        const w = nameById.get(g.workerId);
        return {
          workerId: g.workerId,
          name: w?.name ?? "?",
          phone: w?.phone ?? "",
          unitName: w?.orgUnit.name ?? "",
          assigned: g._count._all,
        };
      })
      .sort((a, b) => b.assigned - a.assigned);

    return {
      totalVoters,
      assigned: assignedCount,
      unassigned: totalVoters - assignedCount,
      coveragePct: totalVoters ? Math.round((assignedCount / totalVoters) * 100) : 0,
      workers: perWorker,
    };
  }
}
