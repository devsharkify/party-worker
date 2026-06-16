import { Injectable } from "@nestjs/common";
import type { OrgUnitNode, OrgUnitType } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";

interface OrgRow {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
}

const LEVEL_ORDER: OrgUnitType[] = ["state", "district", "constituency", "mandal", "booth"];

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(): Promise<OrgRow[]> {
    const all = await this.prisma.orgUnit.findMany({
      select: { id: true, name: true, type: true, parentId: true },
    });
    return all as OrgRow[];
  }

  /** All org unit ids in the subtree rooted at orgUnitId (inclusive). */
  async getDescendantIds(orgUnitId: string): Promise<string[]> {
    const all = await this.rows();
    const childrenOf = new Map<string, string[]>();
    for (const r of all) {
      if (r.parentId) {
        const arr = childrenOf.get(r.parentId) ?? [];
        arr.push(r.id);
        childrenOf.set(r.parentId, arr);
      }
    }
    const out: string[] = [];
    const stack = [orgUnitId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  /** Walk up from orgUnitId to find the ancestor (or self) of the given level. */
  async getAncestorAtLevel(
    orgUnitId: string,
    level: OrgUnitType,
  ): Promise<OrgRow | null> {
    const all = await this.rows();
    const byId = new Map(all.map((r) => [r.id, r]));
    let cur = byId.get(orgUnitId) ?? null;
    while (cur) {
      if (cur.type === level) return cur;
      cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
    }
    return null;
  }

  /** The chain of (level -> orgUnit) from the user's unit up to state. */
  async getAncestorChain(orgUnitId: string): Promise<OrgRow[]> {
    const all = await this.rows();
    const byId = new Map(all.map((r) => [r.id, r]));
    const chain: OrgRow[] = [];
    let cur = byId.get(orgUnitId) ?? null;
    while (cur) {
      chain.push(cur);
      cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
    }
    return chain;
  }

  /** Election readiness: which booths have at least 1 worker active in the last 7 days. */
  async getBoothCoverage() {
    const booths = await this.prisma.orgUnit.findMany({
      where: { type: "booth" },
      select: { id: true, name: true },
    });
    if (booths.length === 0) return { total: 0, covered: 0, uncovered: [] };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);
    const active = await this.prisma.user.groupBy({
      by: ["orgUnitId"],
      where: {
        orgUnitId: { in: booths.map((b) => b.id) },
        lastActiveAt: { gte: sevenDaysAgo },
      },
    });
    const coveredIds = new Set(active.map((r) => r.orgUnitId));
    const uncovered = booths.filter((b) => !coveredIds.has(b.id));
    return {
      total: booths.length,
      covered: booths.length - uncovered.length,
      uncovered: uncovered.slice(0, 30).map((b) => ({ id: b.id, name: b.name })),
    };
  }

  async getTree(): Promise<OrgUnitNode[]> {
    const all = await this.rows();
    const directChildren = new Map<string, number>();
    const directMembers = new Map<string, number>();
    for (const r of all) {
      if (r.parentId) directChildren.set(r.parentId, (directChildren.get(r.parentId) ?? 0) + 1);
    }
    const memberGroups = await this.prisma.user.groupBy({
      by: ["orgUnitId"],
      _count: { _all: true },
    });
    for (const g of memberGroups) directMembers.set(g.orgUnitId, g._count._all);

    return all
      .sort((a, b) => LEVEL_ORDER.indexOf(a.type) - LEVEL_ORDER.indexOf(b.type))
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        parentId: r.parentId,
        childrenCount: directChildren.get(r.id) ?? 0,
        memberCount: directMembers.get(r.id) ?? 0,
      }));
  }
}
