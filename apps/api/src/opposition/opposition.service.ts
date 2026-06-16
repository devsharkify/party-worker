import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OppositionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: { party: string; headline: string; details?: string }, createdById: string) {
    return this.prisma.oppositionItem.create({
      data: { party: dto.party, headline: dto.headline, details: dto.details ?? null, createdById },
    });
  }

  async list(limit = 30) {
    return this.prisma.oppositionItem.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async addResponse(id: string, trsResponse: string) {
    const item = await this.prisma.oppositionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Item not found");
    return this.prisma.oppositionItem.update({ where: { id }, data: { trsResponse } });
  }
}
