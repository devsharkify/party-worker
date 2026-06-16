import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WaGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(orgUnitId: string, link: string, label?: string) {
    return this.prisma.waGroup.upsert({
      where: { orgUnitId },
      create: { orgUnitId, link, label: label ?? null },
      update: { link, label: label ?? undefined },
    });
  }

  async getForUnit(orgUnitId: string) {
    return this.prisma.waGroup.findUnique({ where: { orgUnitId } });
  }

  async getChain(orgUnitId: string) {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId }, include: { parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } } } });
    if (!unit) return [];

    const chain: string[] = [orgUnitId];
    let cur: typeof unit.parent = unit.parent;
    while (cur) { chain.push(cur.id); cur = (cur as any).parent; }

    const groups = await this.prisma.waGroup.findMany({ where: { orgUnitId: { in: chain } } });
    return groups;
  }
}
