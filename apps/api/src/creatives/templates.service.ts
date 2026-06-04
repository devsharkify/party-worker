import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTemplateDto, RenderTemplate, TemplateZone } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTemplateDto): Promise<RenderTemplate> {
    const t = await this.prisma.template.create({
      data: {
        name: dto.name,
        canvasWidth: dto.canvasWidth,
        canvasHeight: dto.canvasHeight,
        zones: dto.zones as unknown as object,
        createdById: userId,
      },
    });
    return this.toRenderTemplate(t);
  }

  async list(): Promise<RenderTemplate[]> {
    const all = await this.prisma.template.findMany({ orderBy: { createdAt: "desc" } });
    return all.map((t) => this.toRenderTemplate(t));
  }

  async get(id: string): Promise<RenderTemplate> {
    const t = await this.prisma.template.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Template not found");
    return this.toRenderTemplate(t);
  }

  private toRenderTemplate(t: {
    id: string;
    name: string;
    canvasWidth: number;
    canvasHeight: number;
    zones: unknown;
  }): RenderTemplate {
    return {
      id: t.id,
      name: t.name,
      canvasWidth: t.canvasWidth,
      canvasHeight: t.canvasHeight,
      zones: (t.zones as TemplateZone[]) ?? [],
    };
  }
}
