import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { assignableRoles, roleFitsUnit, type Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { ScoringService } from "../scoring/scoring.service";
import { APP_ENV, type Env } from "../config/env";
import type { AuthUser } from "../auth/auth.types";

/** Points awarded to the inviter when a recruit accepts and joins. */
const RECRUIT_INITIAL = 25;

/** Invite links live for two weeks from creation. */
const EXPIRY_DAYS = 14;

/** Leader roles that may create invites scoped to their own subtree. */
const LEADER_ROLES: Role[] = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
];

export interface CreateInviteResult {
  token: string;
  url: string;
  orgUnitId: string;
  role: Role;
  expiresAt: Date | null;
}

export interface InviteStatus {
  valid: boolean;
  orgUnitName?: string;
  role?: Role;
  expired: boolean;
  accepted: boolean;
}

export interface AcceptInviteResult {
  ok: true;
  name: string;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
    private readonly scoring: ScoringService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  /** Normalize a 10-digit or +91… phone to canonical +91XXXXXXXXXX. */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (last10.length !== 10) {
      throw new BadRequestException("A valid 10-digit phone number is required.");
    }
    return `+91${last10}`;
  }

  /** hq/state admins may invite anywhere; leaders only within their own subtree + assignable, fitting roles. */
  private async assertCanInvite(actor: AuthUser, orgUnitId: string, role: Role): Promise<void> {
    if (!this.isGlobal(actor.role)) {
      if (!LEADER_ROLES.includes(actor.role)) {
        throw new ForbiddenException("Only leaders can create invite links.");
      }
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      const subtree = await this.org.getDescendantIds(me.orgUnitId);
      if (!subtree.includes(orgUnitId)) {
        throw new ForbiddenException("You can only invite into units within your own area.");
      }
      if (!assignableRoles(actor.role).includes(role)) {
        throw new ForbiddenException(`You are not allowed to assign the ${role} role.`);
      }
    }
  }

  async create(actor: AuthUser, orgUnitId: string, role: Role): Promise<CreateInviteResult> {
    await this.assertCanInvite(actor, orgUnitId, role);
    const unit = await this.prisma.orgUnit.findUniqueOrThrow({ where: { id: orgUnitId } });
    if (!roleFitsUnit(role, unit.type)) {
      throw new BadRequestException(`A ${role.replace(/_/g, " ")} cannot be placed in a ${unit.type}.`);
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 3600_000);
    const invite = await this.prisma.inviteLink.create({
      data: { token, orgUnitId, role, createdById: actor.id, expiresAt },
    });

    return {
      token: invite.token,
      url: `${this.env.WEB_APP_URL}/join/${invite.token}`,
      orgUnitId: invite.orgUnitId,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  }

  async status(token: string): Promise<InviteStatus> {
    const invite = await this.prisma.inviteLink.findUnique({ where: { token } });
    if (!invite) {
      return { valid: false, expired: false, accepted: false };
    }
    const accepted = invite.acceptedById != null;
    const expired = invite.expiresAt != null && invite.expiresAt.getTime() < Date.now();
    const valid = !accepted && !expired;
    const unit = await this.prisma.orgUnit.findUnique({ where: { id: invite.orgUnitId } });
    return {
      valid,
      orgUnitName: unit?.name,
      role: invite.role,
      expired,
      accepted,
    };
  }

  async accept(token: string, name: string, phone: string): Promise<AcceptInviteResult> {
    const invite = await this.prisma.inviteLink.findUnique({ where: { token } });
    if (!invite) throw new BadRequestException("This invite link is not valid.");
    if (invite.acceptedById != null) {
      throw new ConflictException("This invite link has already been used.");
    }
    if (invite.expiresAt != null && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This invite link has expired.");
    }

    const normalizedPhone = this.normalizePhone(phone);
    const existing = await this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existing) throw new ConflictException("That phone number is already registered.");

    const now = new Date();
    const newUser = await this.prisma.user.create({
      data: {
        name,
        phone: normalizedPhone,
        role: invite.role,
        orgUnitId: invite.orgUnitId,
        recruitedById: invite.createdById,
        recruitedAt: now,
        preferredLanguage: "te",
        tier: "karyakarta",
      },
    });

    await this.prisma.inviteLink.update({
      where: { id: invite.id },
      data: { acceptedById: newUser.id, acceptedAt: now },
    });

    await this.scoring.award(invite.createdById, "recruit_initial", RECRUIT_INITIAL, {
      recruitedUserId: newUser.id,
      viaInvite: true,
    });

    return { ok: true, name: newUser.name };
  }
}
