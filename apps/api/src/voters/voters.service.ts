import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LEADER_ROLES, type Role } from "@pw/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { ScoringService } from "../scoring/scoring.service";
import type { AuthUser } from "../auth/auth.types";
import { parseVoterCsv, type ParsedVoterRow } from "./voter-csv.util";

const SURVEY_POINTS = 10;
const MAX_PAGE_SIZE = 200;
const MAX_IMPORT_ROWS = 20_000;
const VOTING_STATUSES = ["unmarked", "green", "yellow", "red"] as const;
type VotingStatus = (typeof VOTING_STATUSES)[number];

export interface VoterScope {
  /** null = global (HQ/state admin, whole tree). Else allowed org-unit id set. */
  unitIds: Set<string> | null;
  canGrant: boolean;
  canImport: boolean;
}

interface ListQuery {
  orgUnitId?: string;
  status?: string;
  gender?: string;
  q?: string;
  voted?: string | boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class VotersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
    private readonly scoring: ScoringService,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  private isLeader(role: Role): boolean {
    return LEADER_ROLES.includes(role);
  }

  /**
   * The heart of the module: resolve what the actor may see.
   * Global admins see everything; everyone else needs the backend-toggled
   * voterAccessEnabled flag and is confined to their org subtree.
   */
  async resolveScope(actor: AuthUser): Promise<VoterScope> {
    if (this.isGlobal(actor.role)) {
      return { unitIds: null, canGrant: true, canImport: true };
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!me.voterAccessEnabled) {
      throw new ForbiddenException("Voter roll access is not enabled for you.");
    }
    const ids = new Set(await this.org.getDescendantIds(me.orgUnitId));
    const leader = this.isLeader(actor.role);
    return { unitIds: ids, canGrant: leader, canImport: leader };
  }

  /** App/admin gate probe — never throws, reports the actor's capabilities. */
  async access(actor: AuthUser) {
    if (this.isGlobal(actor.role)) {
      return { enabled: true, canGrant: true, canImport: true, scopeUnit: null };
    }
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: { orgUnit: { select: { id: true, name: true, type: true } } },
    });
    return {
      enabled: me.voterAccessEnabled,
      canGrant: me.voterAccessEnabled && this.isLeader(actor.role),
      canImport: me.voterAccessEnabled && this.isLeader(actor.role),
      scopeUnit: me.orgUnit,
    };
  }

  /** Assert one unit is inside the actor's scope; returns the scope. */
  private async assertUnitInScope(actor: AuthUser, orgUnitId: string): Promise<VoterScope> {
    const scope = await this.resolveScope(actor);
    if (scope.unitIds && !scope.unitIds.has(orgUnitId)) {
      throw new ForbiddenException("That unit is outside your area.");
    }
    return scope;
  }

  /** All unit ids the query may touch: a subtree of `orgUnitId` clipped to scope. */
  private async queryUnitIds(actor: AuthUser, orgUnitId?: string): Promise<string[] | null> {
    const scope = await this.resolveScope(actor);
    if (!orgUnitId) {
      return scope.unitIds ? [...scope.unitIds] : null;
    }
    if (scope.unitIds && !scope.unitIds.has(orgUnitId)) {
      throw new ForbiddenException("That unit is outside your area.");
    }
    return this.org.getDescendantIds(orgUnitId);
  }

  private log(
    userId: string,
    action: string,
    extra: { orgUnitId?: string; voterId?: string; detail?: string } = {},
  ): void {
    // Fire-and-forget: an audit-write hiccup must never fail the user action.
    void this.prisma.voterAccessLog
      .create({
        data: {
          userId,
          action,
          orgUnitId: extra.orgUnitId ?? null,
          voterId: extra.voterId ?? null,
          detail: extra.detail ?? null,
        },
      })
      .catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Units + listing + search
  // -------------------------------------------------------------------------

  async units(actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const tree = await this.org.getTree();
    const nodes = scope.unitIds ? tree.filter((n) => scope.unitIds!.has(n.id)) : tree;

    const counts = await this.prisma.voter.groupBy({
      by: ["boothId"],
      _count: { _all: true },
      ...(scope.unitIds ? { where: { boothId: { in: [...scope.unitIds] } } } : {}),
    });
    const countByBooth = new Map(counts.map((c) => [c.boothId, c._count._all]));

    return nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      parentId: n.parentId,
      voterCount: countByBooth.get(n.id) ?? 0,
    }));
  }

  private buildVoterWhere(unitIds: string[] | null, q: ListQuery) {
    const where: Record<string, unknown> = {};
    if (unitIds) where.boothId = { in: unitIds };
    if (q.status) {
      if (!VOTING_STATUSES.includes(q.status as VotingStatus)) {
        throw new BadRequestException("Invalid status filter.");
      }
      where.votingStatus = q.status;
    }
    if (q.gender) where.gender = q.gender;
    if (q.voted !== undefined && q.voted !== "") {
      where.isVoted = q.voted === true || q.voted === "true";
    }
    if (q.q?.trim()) {
      const term = q.q.trim();
      where.OR = [
        { nameEn: { contains: term, mode: "insensitive" } },
        { nameTe: { contains: term } },
        { epicNo: { contains: term, mode: "insensitive" } },
        { houseNo: { contains: term, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private page(q: ListQuery): { page: number; pageSize: number } {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 50));
    return { page, pageSize };
  }

  async list(actor: AuthUser, q: ListQuery) {
    const unitIds = await this.queryUnitIds(actor, q.orgUnitId);
    const where = this.buildVoterWhere(unitIds, q);
    const { page, pageSize } = this.page(q);
    const [items, total] = await Promise.all([
      this.prisma.voter.findMany({
        where,
        orderBy: [{ partNo: "asc" }, { serialNo: "asc" }, { nameEn: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.voter.count({ where }),
    ]);
    this.log(actor.id, "list", { orgUnitId: q.orgUnitId, detail: q.q?.trim() || undefined });
    return { items, total, page, pageSize };
  }

  async search(actor: AuthUser, q: ListQuery) {
    if (!q.q?.trim()) return { items: [], total: 0, page: 1, pageSize: 50 };
    const result = await this.list(actor, q);
    this.log(actor.id, "search", { detail: q.q.trim() });
    return result;
  }

  async detail(actor: AuthUser, id: string) {
    const voter = await this.prisma.voter.findUnique({ where: { id } });
    if (!voter) throw new NotFoundException("Voter not found.");
    await this.assertUnitInScope(actor, voter.boothId);
    const family = voter.houseNo
      ? await this.prisma.voter.findMany({
          where: { boothId: voter.boothId, houseNo: voter.houseNo, id: { not: voter.id } },
          orderBy: { age: "desc" },
          take: 25,
        })
      : [];
    this.log(actor.id, "view", { voterId: id, orgUnitId: voter.boothId });
    return { voter, family };
  }

  // -------------------------------------------------------------------------
  // Updates
  // -------------------------------------------------------------------------

  async update(
    actor: AuthUser,
    id: string,
    dto: { votingStatus?: string; mobile?: string; notes?: string; isVoted?: boolean },
  ) {
    const voter = await this.prisma.voter.findUnique({ where: { id } });
    if (!voter) throw new NotFoundException("Voter not found.");
    await this.assertUnitInScope(actor, voter.boothId);

    const data: Record<string, unknown> = { updatedById: actor.id };
    const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (dto.votingStatus !== undefined) {
      if (!VOTING_STATUSES.includes(dto.votingStatus as VotingStatus)) {
        throw new BadRequestException("votingStatus must be unmarked|green|yellow|red.");
      }
      data.votingStatus = dto.votingStatus;
      if (dto.votingStatus !== voter.votingStatus) {
        diffs.push({ field: "votingStatus", from: voter.votingStatus, to: dto.votingStatus });
      }
    }
    if (dto.mobile !== undefined) {
      data.mobile = dto.mobile?.trim() || null;
      if (data.mobile !== voter.mobile) diffs.push({ field: "mobile", from: voter.mobile, to: data.mobile });
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null;
      if (data.notes !== voter.notes) diffs.push({ field: "notes", from: voter.notes, to: data.notes });
    }
    if (dto.isVoted !== undefined) {
      data.isVoted = dto.isVoted;
      data.votedAt = dto.isVoted ? new Date() : null;
      if (dto.isVoted !== voter.isVoted) diffs.push({ field: "isVoted", from: voter.isVoted, to: dto.isVoted });
    }

    const updated = await this.prisma.voter.update({ where: { id }, data });
    if (diffs.length > 0) {
      // Best-effort history row — never fail the edit over bookkeeping.
      void this.prisma.voterChange
        .create({
          data: { voterId: id, userId: actor.id, changes: diffs as unknown as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
    }
    this.log(actor.id, "update", {
      voterId: id,
      orgUnitId: voter.boothId,
      detail: Object.keys(dto).join(","),
    });
    return updated;
  }

  async bulkUpdate(actor: AuthUser, dto: { ids: string[]; votingStatus: string }) {
    if (!Array.isArray(dto.ids) || dto.ids.length === 0 || dto.ids.length > 500) {
      throw new BadRequestException("ids must be a non-empty array (max 500).");
    }
    if (!VOTING_STATUSES.includes(dto.votingStatus as VotingStatus)) {
      throw new BadRequestException("votingStatus must be unmarked|green|yellow|red.");
    }
    const scope = await this.resolveScope(actor);
    const result = await this.prisma.voter.updateMany({
      where: {
        id: { in: dto.ids },
        ...(scope.unitIds ? { boothId: { in: [...scope.unitIds] } } : {}),
      },
      data: { votingStatus: dto.votingStatus, updatedById: actor.id },
    });
    this.log(actor.id, "bulk_update", {
      detail: `${result.count}/${dto.ids.length} → ${dto.votingStatus}`,
    });
    return { updated: result.count };
  }

  // -------------------------------------------------------------------------
  // CSV import
  // -------------------------------------------------------------------------

  async import(
    actor: AuthUser,
    dto: { boothId: string; filename?: string; csvText: string },
  ) {
    if (!dto.boothId || !dto.csvText?.trim()) {
      throw new BadRequestException("boothId and csvText are required.");
    }
    const scope = await this.assertUnitInScope(actor, dto.boothId);
    if (!scope.canImport) throw new ForbiddenException("You cannot import voter rolls.");

    const booth = await this.prisma.orgUnit.findUniqueOrThrow({ where: { id: dto.boothId } });
    if (booth.type !== "booth") {
      throw new BadRequestException("Voter rolls import into polling-booth units only.");
    }

    const { rows, errors } = parseVoterCsv(dto.csvText);
    if (rows.length + errors.length === 0) throw new BadRequestException("CSV has no data rows.");
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Too many rows (max ${MAX_IMPORT_ROWS}); split the file.`);
    }

    const record = await this.prisma.voterImport.create({
      data: {
        boothId: dto.boothId,
        uploadedById: actor.id,
        filename: dto.filename ?? null,
        totalRows: rows.length + errors.length,
        imported: 0,
        skipped: errors.length,
        errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    let imported = 0;
    const rowErrors = [...errors];
    // Chunked upserts: dedupe on (boothId, epicNo) so re-importing a corrected
    // roll updates in place instead of duplicating.
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((r) => this.upsertRow(dto.boothId, record.id, r)),
      );
      imported += chunk.length;
    }

    const final = await this.prisma.voterImport.update({
      where: { id: record.id },
      data: {
        imported,
        skipped: rowErrors.length,
        errors: rowErrors.length ? (rowErrors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    this.log(actor.id, "import", {
      orgUnitId: dto.boothId,
      detail: `${imported} imported, ${rowErrors.length} skipped (${dto.filename ?? "csv"})`,
    });
    return {
      importId: final.id,
      totalRows: final.totalRows,
      imported,
      skipped: rowErrors.length,
      errors: rowErrors,
    };
  }

  private upsertRow(boothId: string, importId: string, r: ParsedVoterRow) {
    const data = {
      serialNo: r.serialNo ?? null,
      nameEn: r.nameEn,
      nameTe: r.nameTe ?? null,
      relationName: r.relationName ?? null,
      relationType: r.relationType ?? null,
      gender: r.gender ?? null,
      age: r.age ?? null,
      houseNo: r.houseNo ?? null,
      address: r.address ?? null,
      mobile: r.mobile ?? null,
      partNo: r.partNo ?? null,
      sectionNo: r.sectionNo ?? null,
      acNo: r.acNo ?? null,
      importId,
    };
    if (r.epicNo) {
      return this.prisma.voter.upsert({
        where: { boothId_epicNo: { boothId, epicNo: r.epicNo } },
        create: { boothId, epicNo: r.epicNo, ...data },
        update: data,
      });
    }
    return this.prisma.voter.create({ data: { boothId, epicNo: null, ...data } });
  }

  async imports(actor: AuthUser, orgUnitId?: string) {
    const unitIds = await this.queryUnitIds(actor, orgUnitId);
    return this.prisma.voterImport.findMany({
      where: unitIds ? { boothId: { in: unitIds } } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        booth: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  async stats(actor: AuthUser, orgUnitId?: string) {
    const unitIds = await this.queryUnitIds(actor, orgUnitId);
    const where = unitIds ? { boothId: { in: unitIds } } : {};

    const [total, byStatus, byGender, voted, surveys, ages] = await Promise.all([
      this.prisma.voter.count({ where }),
      this.prisma.voter.groupBy({ by: ["votingStatus"], _count: { _all: true }, where }),
      this.prisma.voter.groupBy({ by: ["gender"], _count: { _all: true }, where }),
      this.prisma.voter.count({ where: { ...where, isVoted: true } }),
      this.prisma.voterSurvey.count({ where }),
      this.prisma.voter.findMany({ where, select: { age: true } }),
    ]);

    const marked = { green: 0, yellow: 0, red: 0, unmarked: 0 };
    for (const s of byStatus) {
      if (s.votingStatus in marked) marked[s.votingStatus as keyof typeof marked] = s._count._all;
    }
    const gender = { M: 0, F: 0, O: 0 };
    for (const g of byGender) {
      if (g.gender && g.gender in gender) gender[g.gender as keyof typeof gender] = g._count._all;
    }
    const ageBands = { b18_25: 0, b26_35: 0, b36_50: 0, b51_65: 0, b66p: 0 };
    for (const { age } of ages) {
      if (age == null) continue;
      if (age <= 25) ageBands.b18_25++;
      else if (age <= 35) ageBands.b26_35++;
      else if (age <= 50) ageBands.b36_50++;
      else if (age <= 65) ageBands.b51_65++;
      else ageBands.b66p++;
    }

    const units = await this.childUnitBreakdown(actor, orgUnitId);
    this.log(actor.id, "stats", { orgUnitId });
    return { total, marked, gender, ageBands, voted, surveys, units };
  }

  /** Per-child-unit rollup (each child aggregates its own subtree). */
  private async childUnitBreakdown(actor: AuthUser, orgUnitId?: string) {
    const scope = await this.resolveScope(actor);
    let rootId = orgUnitId;
    if (!rootId) {
      if (scope.unitIds) {
        const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
        rootId = me.orgUnitId;
      } else {
        const root = await this.prisma.orgUnit.findFirst({ where: { parentId: null } });
        rootId = root?.id;
      }
    }
    if (!rootId) return [];

    const children = await this.prisma.orgUnit.findMany({
      where: { parentId: rootId },
      select: { id: true, name: true, type: true },
    });
    const inScope = scope.unitIds ? children.filter((c) => scope.unitIds!.has(c.id)) : children;

    return Promise.all(
      inScope.map(async (c) => {
        const subtree = await this.org.getDescendantIds(c.id);
        const where = { boothId: { in: subtree } };
        const [tot, byStatus, vot] = await Promise.all([
          this.prisma.voter.count({ where }),
          this.prisma.voter.groupBy({ by: ["votingStatus"], _count: { _all: true }, where }),
          this.prisma.voter.count({ where: { ...where, isVoted: true } }),
        ]);
        const tally = { green: 0, yellow: 0, red: 0 };
        for (const s of byStatus) {
          if (s.votingStatus in tally) tally[s.votingStatus as keyof typeof tally] = s._count._all;
        }
        return { id: c.id, name: c.name, type: c.type, total: tot, ...tally, voted: vot };
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Household surveys
  // -------------------------------------------------------------------------

  async createSurvey(actor: AuthUser, dto: Record<string, unknown>) {
    if (!dto.householdName || typeof dto.householdName !== "string") {
      throw new BadRequestException("householdName is required.");
    }
    // Workers survey without needing roll read access; scope check only if a
    // boothId outside their subtree is claimed.
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    let boothId = typeof dto.boothId === "string" && dto.boothId ? dto.boothId : me.orgUnitId;
    if (boothId !== me.orgUnitId && !this.isGlobal(actor.role)) {
      const subtree = await this.org.getDescendantIds(me.orgUnitId);
      if (!subtree.includes(boothId)) boothId = me.orgUnitId;
    }
    let voterId: string | null = null;
    if (typeof dto.voterId === "string" && dto.voterId) {
      const voter = await this.prisma.voter.findUnique({ where: { id: dto.voterId } });
      if (voter) {
        voterId = voter.id;
        boothId = voter.boothId;
      }
    }

    const count = Number(dto.familyMembersCount);
    const survey = await this.prisma.voterSurvey.create({
      data: {
        workerId: actor.id,
        boothId,
        voterId,
        householdName: dto.householdName.trim(),
        mobile: (dto.mobile as string) || null,
        address: (dto.address as string) || null,
        religion: (dto.religion as string) || null,
        caste: (dto.caste as string) || null,
        familyMembersCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
        familyDetails: Array.isArray(dto.familyDetails) ? dto.familyDetails : undefined,
        knowsLocalLeader:
          typeof dto.knowsLocalLeader === "boolean" ? dto.knowsLocalLeader : null,
        currentPartySupport: (dto.currentPartySupport as string) || null,
        supportLevel: (dto.supportLevel as string) || null,
        servicesReceived: (dto.servicesReceived as string) || null,
        incomeRange: (dto.incomeRange as string) || null,
        mainOccupation: (dto.mainOccupation as string) || null,
        housingType: (dto.housingType as string) || null,
        issues: (dto.issues as string) || null,
        latitude: typeof dto.latitude === "number" ? dto.latitude : null,
        longitude: typeof dto.longitude === "number" ? dto.longitude : null,
      },
    });
    void this.scoring
      .award(actor.id, "voter_survey" as never, SURVEY_POINTS, { surveyId: survey.id })
      .catch(() => undefined);
    return survey;
  }

  mySurveys(actor: AuthUser) {
    return this.prisma.voterSurvey.findMany({
      where: { workerId: actor.id },
      orderBy: { visitDate: "desc" },
      take: 100,
    });
  }

  async surveys(actor: AuthUser, q: ListQuery) {
    const unitIds = await this.queryUnitIds(actor, q.orgUnitId);
    const where = unitIds ? { boothId: { in: unitIds } } : {};
    const { page, pageSize } = this.page(q);
    const [items, total] = await Promise.all([
      this.prisma.voterSurvey.findMany({
        where,
        orderBy: { visitDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          worker: { select: { id: true, name: true } },
          booth: { select: { id: true, name: true } },
        },
      }),
      this.prisma.voterSurvey.count({ where }),
    ]);
    this.log(actor.id, "survey_list", { orgUnitId: q.orgUnitId });
    return { items, total, page, pageSize };
  }

  async surveyStats(actor: AuthUser, orgUnitId?: string) {
    const unitIds = await this.queryUnitIds(actor, orgUnitId);
    const where = unitIds ? { boothId: { in: unitIds } } : {};
    const rows = await this.prisma.voterSurvey.findMany({
      where,
      select: {
        supportLevel: true,
        currentPartySupport: true,
        incomeRange: true,
        housingType: true,
      },
    });
    const supportLevel = { strong: 0, leaning: 0, neutral: 0, opposed: 0 };
    const partySupport: Record<string, number> = {};
    const incomeRange: Record<string, number> = {};
    const housingType: Record<string, number> = {};
    for (const r of rows) {
      if (r.supportLevel && r.supportLevel in supportLevel) {
        supportLevel[r.supportLevel as keyof typeof supportLevel]++;
      }
      if (r.currentPartySupport) {
        partySupport[r.currentPartySupport] = (partySupport[r.currentPartySupport] ?? 0) + 1;
      }
      if (r.incomeRange) incomeRange[r.incomeRange] = (incomeRange[r.incomeRange] ?? 0) + 1;
      if (r.housingType) housingType[r.housingType] = (housingType[r.housingType] ?? 0) + 1;
    }
    return { total: rows.length, supportLevel, partySupport, incomeRange, housingType };
  }

  // -------------------------------------------------------------------------
  // Change history
  // -------------------------------------------------------------------------

  changesMine(actor: AuthUser) {
    return this.prisma.voterChange.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { voter: { select: { id: true, nameEn: true, nameTe: true } } },
    });
  }

  async history(actor: AuthUser, voterId: string) {
    const voter = await this.prisma.voter.findUnique({ where: { id: voterId } });
    if (!voter) throw new NotFoundException("Voter not found.");
    await this.assertUnitInScope(actor, voter.boothId);
    const items = await this.prisma.voterChange.findMany({
      where: { voterId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true } } },
    });
    return { items };
  }

  // -------------------------------------------------------------------------
  // Access grants + audit log
  // -------------------------------------------------------------------------

  async grants(actor: AuthUser, orgUnitId?: string) {
    const scope = await this.resolveScope(actor);
    if (!scope.canGrant) throw new ForbiddenException("You cannot manage voter access.");
    const unitIds = await this.queryUnitIds(actor, orgUnitId);
    const members = await this.prisma.user.findMany({
      where: unitIds ? { orgUnitId: { in: unitIds } } : {},
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        voterAccessEnabled: true,
        orgUnit: { select: { name: true } },
      },
      orderBy: [{ voterAccessEnabled: "desc" }, { name: "asc" }],
      take: 500,
    });
    return members.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      role: m.role,
      orgUnitName: m.orgUnit.name,
      voterAccessEnabled: m.voterAccessEnabled,
    }));
  }

  async setGrant(actor: AuthUser, userId: string, enabled: boolean) {
    const scope = await this.resolveScope(actor);
    if (!scope.canGrant) throw new ForbiddenException("You cannot manage voter access.");
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("Member not found.");
    if (scope.unitIds && !scope.unitIds.has(target.orgUnitId)) {
      throw new ForbiddenException("That member is outside your area.");
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { voterAccessEnabled: enabled },
      select: { id: true, voterAccessEnabled: true },
    });
    this.log(actor.id, enabled ? "grant" : "revoke", {
      detail: `${target.name} (${target.phone})`,
    });
    return updated;
  }

  async accessLogs(
    actor: AuthUser,
    q: { page?: number; pageSize?: number; userId?: string },
  ) {
    if (!this.isGlobal(actor.role)) {
      throw new ForbiddenException("Only HQ can read voter access logs.");
    }
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 50));
    const where = q.userId ? { userId: q.userId } : {};
    const [items, total] = await Promise.all([
      this.prisma.voterAccessLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.voterAccessLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
