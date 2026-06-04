import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";

/** Leader roles that may broadcast within their own subtree. */
const LEADER_ROLES: ReadonlySet<Role> = new Set<Role>([
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
]);

/** Roles that may broadcast to any target, including org-wide (null). */
const HQ_ROLES: ReadonlySet<Role> = new Set<Role>(["hq_admin", "state_admin"]);

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  targetOrgUnitId?: string;
}

export interface AnnouncementResponse {
  id: string;
  title: string;
  body: string;
  targetOrgUnitId: string | null;
  createdAt: string;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  /**
   * Create a broadcast. HQ/state admins may target any unit (or org-wide via a
   * null target); other leaders must target a unit inside their own subtree.
   */
  async create(
    user: { id: string; role: Role },
    input: CreateAnnouncementInput,
  ): Promise<AnnouncementResponse> {
    const target = input.targetOrgUnitId ?? null;

    if (!HQ_ROLES.has(user.role)) {
      if (!LEADER_ROLES.has(user.role) || target === null) {
        throw new ForbiddenException("Not allowed to broadcast to this target");
      }
      const author = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const subtree = await this.org.getDescendantIds(author.orgUnitId);
      if (!subtree.includes(target)) {
        throw new ForbiddenException("Target is outside your org subtree");
      }
    }

    const row = await this.prisma.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        targetOrgUnitId: target,
        createdById: user.id,
      },
    });

    return this.toResponse(row);
  }

  /** Announcements visible to the user: org-wide, or aimed at any unit on the
   *  user's ancestor chain (self up to the root). Newest first. */
  async list(user: { id: string }): Promise<AnnouncementResponse[]> {
    const author = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const ancestorIds = (await this.org.getAncestorChain(author.orgUnitId)).map((n) => n.id);

    const rows = await this.prisma.announcement.findMany({
      where: {
        OR: [{ targetOrgUnitId: null }, { targetOrgUnitId: { in: ancestorIds } }],
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r) => this.toResponse(r));
  }

  private toResponse(row: {
    id: string;
    title: string;
    body: string;
    targetOrgUnitId: string | null;
    createdAt: Date;
  }): AnnouncementResponse {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      targetOrgUnitId: row.targetOrgUnitId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
