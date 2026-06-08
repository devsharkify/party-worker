import { Inject, Injectable } from "@nestjs/common";
import type { AreaGrievanceSummary, CreateGrievanceDto, GrievanceCreated, GrievanceSummary } from "@pw/shared";
import { SCORING } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { OrgService } from "../org/org.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";

const FILE_POINTS = SCORING.GRIEVANCE_FILE;

@Injectable()
export class GrievancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly org: OrgService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private mediaUrl(key: string): string {
    return /^https?:\/\//.test(key) ? key : this.storage.publicUrl(key);
  }

  async create(userId: string, dto: CreateGrievanceDto): Promise<GrievanceCreated> {
    const grievance = await this.prisma.grievance.create({
      data: {
        title: dto.title,
        category: dto.title,
        description: dto.description?.trim() || null,
        citizenName: dto.citizenName || null,
        citizenPhone: dto.citizenPhone || null,
        location: dto.location || null,
        photoKey: dto.photoKey || null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
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
      photoUrl: g.photoKey ? this.mediaUrl(g.photoKey) : null,
      lat: g.lat,
      lng: g.lng,
    }));
  }

  /**
   * Recent grievances from the worker's org subtree (same mandal + above), anonymized.
   * Citizen contact is stripped — only category/status/location/photo returned.
   */
  async listArea(userId: string): Promise<AreaGrievanceSummary[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { orgUnit: true },
    });
    // Walk up to mandal level for area scope (or use current unit if higher than mandal)
    const ancestors = await this.org.getAncestorChain(user.orgUnitId);
    const scopeIds = [user.orgUnitId, ...ancestors.map((a) => a.id)];

    // Find all workers in the scoped org units
    const workers = await this.prisma.user.findMany({
      where: { orgUnitId: { in: scopeIds } },
      select: { id: true },
    });
    const workerIds = workers.map((w) => w.id);

    const grievances = await this.prisma.grievance.findMany({
      where: {
        filedById: { in: workerIds },
        // Exclude the caller's own (already shown in "mine")
        NOT: { filedById: userId },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { filedBy: { include: { orgUnit: true } } },
    });

    return grievances.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
      description: g.description,
      location: g.location,
      photoUrl: g.photoKey ? this.mediaUrl(g.photoKey) : null,
      lat: g.lat,
      lng: g.lng,
      orgUnitName: g.filedBy.orgUnit.name,
    }));
  }
}
