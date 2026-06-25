import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Roles permitted to create / update manifesto items. */
const ADMIN_ROLES: ReadonlySet<Role> = new Set<Role>(["hq_admin", "state_admin"]);

export interface CreateManifestoInput {
  title: string;
  description: string;
  category: string;
  status?: string;
  progressPct?: number;
  targetDate?: string;
}

export interface UpdateStatusInput {
  status: string;
  progressPct?: number;
  completedAt?: string | null;
}

export interface ManifestoItemResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  progressPct: number;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ManifestoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public listing — all workers can see manifesto items, newest first. */
  async list(): Promise<ManifestoItemResponse[]> {
    const rows = await this.prisma.manifestoItem.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toResponse(r));
  }

  /** Admin: create a new manifesto promise. */
  async create(
    user: { role: Role },
    input: CreateManifestoInput,
  ): Promise<ManifestoItemResponse> {
    if (!ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException("Only admins can post manifesto items");
    }

    const row = await this.prisma.manifestoItem.create({
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        status: input.status ?? "promised",
        progressPct: input.progressPct ?? 0,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
      },
    });

    return this.toResponse(row);
  }

  /** Admin: update status/progress on an existing item. */
  async updateStatus(
    user: { role: Role },
    id: string,
    input: UpdateStatusInput,
  ): Promise<ManifestoItemResponse> {
    if (!ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException("Only admins can update manifesto items");
    }

    const existing = await this.prisma.manifestoItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ManifestoItem ${id} not found`);
    }

    const completedAt =
      input.completedAt === null
        ? null
        : input.completedAt
          ? new Date(input.completedAt)
          : input.status === "completed"
            ? new Date()
            : existing.completedAt;

    const row = await this.prisma.manifestoItem.update({
      where: { id },
      data: {
        status: input.status,
        progressPct: input.progressPct ?? existing.progressPct,
        completedAt,
      },
    });

    return this.toResponse(row);
  }

  private toResponse(row: {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    progressPct: number;
    targetDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ManifestoItemResponse {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      progressPct: row.progressPct,
      targetDate: row.targetDate ? row.targetDate.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
