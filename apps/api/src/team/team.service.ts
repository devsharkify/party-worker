import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  assignableRoles,
  childTypeOf,
  LEADER_ROLES,
  ORG_TYPE_LABEL,
  roleFitsUnit,
  SCORING,
  type CreateOrgUnitDto,
  type OnboardMemberDto,
  type OnboardResult,
  type OrgMemberRow,
  type OrgUnitNode,
  type OrgUnitType,
  type Role,
} from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { ScoringService } from "../scoring/scoring.service";
import type { AuthUser } from "../auth/auth.types";

/** Field leaders earn recruit points; HQ/state onboard administratively (no points). */
const FIELD_LEADER: Role[] = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
];

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
    private readonly scoring: ScoringService,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  /** The actor may manage (create under / onboard into / view) this unit? */
  async assertCanManageUnit(actor: AuthUser, orgUnitId: string): Promise<void> {
    if (this.isGlobal(actor.role)) return;
    if (!LEADER_ROLES.includes(actor.role)) {
      throw new ForbiddenException("Only leaders can manage teams.");
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const subtree = await this.org.getDescendantIds(me.orgUnitId);
    if (!subtree.includes(orgUnitId)) {
      throw new ForbiddenException("You can only manage units within your own area.");
    }
  }

  /** Units the actor may act on (their subtree; whole tree for HQ/state) — drives pickers. */
  async manageableUnits(actor: AuthUser): Promise<OrgUnitNode[]> {
    const tree = await this.org.getTree();
    if (this.isGlobal(actor.role)) return tree;
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const ids = new Set(await this.org.getDescendantIds(me.orgUnitId));
    return tree.filter((n) => ids.has(n.id));
  }

  async createUnit(actor: AuthUser, dto: CreateOrgUnitDto): Promise<OrgUnitNode> {
    await this.assertCanManageUnit(actor, dto.parentId);
    const parent = await this.prisma.orgUnit.findUniqueOrThrow({ where: { id: dto.parentId } });
    const expected = childTypeOf(parent.type as OrgUnitType);
    if (!expected) {
      throw new BadRequestException(`A ${parent.type} is the lowest level and cannot contain sub-units.`);
    }
    if (dto.type !== expected) {
      throw new BadRequestException(
        `Under a ${ORG_TYPE_LABEL[parent.type as OrgUnitType]} you can only create a ${ORG_TYPE_LABEL[expected]}.`,
      );
    }
    const unit = await this.prisma.orgUnit.create({
      data: { name: dto.name, type: dto.type, parentId: dto.parentId },
    });
    return {
      id: unit.id,
      name: unit.name,
      type: unit.type as OrgUnitType,
      parentId: unit.parentId,
      childrenCount: 0,
      memberCount: 0,
    };
  }

  async onboardMember(actor: AuthUser, dto: OnboardMemberDto): Promise<OnboardResult> {
    await this.assertCanManageUnit(actor, dto.orgUnitId);
    if (!assignableRoles(actor.role).includes(dto.role)) {
      throw new ForbiddenException(`You are not allowed to assign the ${dto.role} role.`);
    }
    const unit = await this.prisma.orgUnit.findUniqueOrThrow({ where: { id: dto.orgUnitId } });
    if (!roleFitsUnit(dto.role, unit.type as OrgUnitType)) {
      throw new BadRequestException(
        `A ${dto.role.replace(/_/g, " ")} cannot be placed in a ${ORG_TYPE_LABEL[unit.type as OrgUnitType]}.`,
      );
    }
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException("That phone number is already registered.");

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        orgUnitId: dto.orgUnitId,
        designation: dto.designation ?? null,
        preferredLanguage: "te",
        tier: "karyakarta",
        recruitedById: actor.id,
        recruitedAt: new Date(),
      },
    });

    // Reward field leaders for growing the network (the self-amplifying loop).
    let recruiterPointsAwarded = 0;
    if (FIELD_LEADER.includes(actor.role)) {
      const res = await this.scoring.award(actor.id, "recruit_initial", SCORING.RECRUIT_INITIAL, {
        recruitedUserId: user.id,
      });
      recruiterPointsAwarded = res.pointsAwarded;
    }

    return { member: await this.toRow(user.id), recruiterPointsAwarded };
  }

  /** Members in a unit (or its whole subtree when subtree=true). */
  async listMembers(
    actor: AuthUser,
    orgUnitId: string,
    subtree = false,
  ): Promise<OrgMemberRow[]> {
    await this.assertCanManageUnit(actor, orgUnitId);
    const ids = subtree ? await this.org.getDescendantIds(orgUnitId) : [orgUnitId];
    const users = await this.prisma.user.findMany({
      where: { orgUnitId: { in: ids } },
      include: { orgUnit: true },
      orderBy: [{ lifetimeReputation: "desc" }],
    });
    return users.map((u) => this.mapRow(u));
  }

  private async toRow(userId: string): Promise<OrgMemberRow> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { orgUnit: true },
    });
    return this.mapRow(u);
  }

  private mapRow(u: {
    id: string;
    name: string;
    phone: string;
    photoUrl: string | null;
    role: string;
    tier: any;
    designation: string | null;
    orgUnitId: string;
    orgUnit: { name: string };
    lifetimeReputation: number;
    weeklyLeaguePoints: number;
    membershipActive: boolean;
  }): OrgMemberRow {
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      photoUrl: u.photoUrl,
      role: u.role as Role,
      tier: u.tier,
      designation: u.designation,
      orgUnitId: u.orgUnitId,
      orgUnitName: u.orgUnit.name,
      lifetimeReputation: u.lifetimeReputation,
      weeklyLeaguePoints: u.weeklyLeaguePoints,
      membershipActive: u.membershipActive,
      isLeader: LEADER_ROLES.includes(u.role as Role),
    };
  }
}
