import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

const CONTACT_POINTS = 5;

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async register(
    dto: { name: string; phone?: string; address?: string; notes?: string; orgUnitId?: string },
    userId: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { orgUnitId: true } });
    const contact = await this.prisma.contact.create({
      data: {
        name: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        registeredById: userId,
        orgUnitId: dto.orgUnitId ?? user.orgUnitId,
      },
    });
    void this.scoring.award(userId, "contact_register" as any, CONTACT_POINTS, { contactId: contact.id }).catch(() => undefined);
    return contact;
  }

  async list(userId: string, limit = 50) {
    return this.prisma.contact.findMany({
      where: { registeredById: userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async unitCount(orgUnitId: string): Promise<{ orgUnitId: string; total: number }> {
    const total = await this.prisma.contact.count({ where: { orgUnitId } });
    return { orgUnitId, total };
  }
}
