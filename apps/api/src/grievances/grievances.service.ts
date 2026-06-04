import { Injectable } from "@nestjs/common";
import type { CreateGrievanceDto, GrievanceCreated, GrievanceSummary } from "@pw/shared";
import { SCORING } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

/** Points credited to a worker for filing a citizen grievance (single source of truth in @pw/shared). */
const FILE_POINTS = SCORING.GRIEVANCE_FILE;

@Injectable()
export class GrievancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async create(userId: string, dto: CreateGrievanceDto): Promise<GrievanceCreated> {
    // `title` carries the category label chosen in the app; citizen contact and
    // location are first-class columns (structured, filterable, privacy-scoped).
    const grievance = await this.prisma.grievance.create({
      data: {
        title: dto.title,
        category: dto.title,
        description: dto.description?.trim() || null,
        citizenName: dto.citizenName || null,
        citizenPhone: dto.citizenPhone || null,
        location: dto.location || null,
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
      description: g.description,
      citizenName: g.citizenName,
      citizenPhone: g.citizenPhone,
      location: g.location,
      photoUrl: g.photoKey ? g.photoKey : null,
    }));
  }
}
