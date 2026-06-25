import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateVoterContactDto {
  boothId: string;
  voterName: string;
  voterPhone?: string;
  address?: string;
  sentiment: "positive" | "neutral" | "negative" | "undecided";
  issue?: string;
  notes?: string;
  contactedAt?: string;
}

@Injectable()
export class VoterContactsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateVoterContactDto, workerId: string) {
    return this.prisma.voterContact.create({
      data: {
        workerId,
        boothId: dto.boothId,
        voterName: dto.voterName,
        voterPhone: dto.voterPhone ?? null,
        address: dto.address ?? null,
        sentiment: dto.sentiment,
        issue: dto.issue ?? null,
        notes: dto.notes ?? null,
        contactedAt: dto.contactedAt ? new Date(dto.contactedAt) : undefined,
      },
    });
  }

  mine(workerId: string) {
    return this.prisma.voterContact.findMany({
      where: { workerId },
      orderBy: { contactedAt: "desc" },
      take: 100,
    });
  }

  async boothStats(boothId: string) {
    const contacts = await this.prisma.voterContact.findMany({
      where: { boothId },
      select: { sentiment: true },
    });

    const total = contacts.length;
    const tally = { positive: 0, neutral: 0, negative: 0, undecided: 0 };
    for (const c of contacts) {
      if (c.sentiment in tally) {
        tally[c.sentiment as keyof typeof tally]++;
      }
    }

    return { boothId, total, sentimentBreakdown: tally };
  }
}
