import { Injectable } from "@nestjs/common";
import type { CreateGrievanceDto, GrievanceCreated, GrievanceSummary } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

/** Points credited to a worker for filing a citizen grievance. */
const FILE_POINTS = 5;

@Injectable()
export class GrievancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  /**
   * The Grievance model stores title/description only, so optional citizen
   * contact + location are appended to the description to avoid losing them.
   */
  private composeDescription(dto: CreateGrievanceDto): string | null {
    const extras: string[] = [];
    if (dto.citizenName) extras.push(`Citizen: ${dto.citizenName}`);
    if (dto.citizenPhone) extras.push(`Phone: ${dto.citizenPhone}`);
    if (dto.location) extras.push(`Location: ${dto.location}`);
    const parts = [dto.description?.trim(), extras.join(" · ")].filter(Boolean);
    return parts.length ? parts.join("\n\n") : null;
  }

  async create(userId: string, dto: CreateGrievanceDto): Promise<GrievanceCreated> {
    const grievance = await this.prisma.grievance.create({
      data: {
        title: dto.title,
        description: this.composeDescription(dto),
        filedById: userId,
      },
    });
    const award = await this.scoring.award(userId, "grievance_file", FILE_POINTS, {
      grievanceId: grievance.id,
    });
    return {
      id: grievance.id,
      title: grievance.title,
      status: grievance.status,
      createdAt: grievance.createdAt.toISOString(),
      pointsAwarded: award.pointsAwarded,
    };
  }

  /** Grievances filed by the current worker, newest first. */
  async listMine(userId: string): Promise<GrievanceSummary[]> {
    const grievances = await this.prisma.grievance.findMany({
      where: { filedById: userId },
      orderBy: { createdAt: "desc" },
    });
    return grievances.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
      photoUrl: g.photoKey ? g.photoKey : null,
    }));
  }
}
