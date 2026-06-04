import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CaptionVariants, CreateCreativeDto } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceService } from "../compliance/compliance.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import { PUSH_PROVIDER, type PushProvider } from "../providers/push.provider";
import { newId } from "../auth/crypto.util";

@Injectable()
export class CreativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  async storeUpload(buffer: Buffer, contentType: string, filename: string) {
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const key = `creatives/${newId()}.${ext}`;
    return this.storage.put(key, buffer, contentType);
  }

  async create(userId: string, dto: CreateCreativeDto) {
    return this.prisma.creative.create({
      data: {
        title: dto.title,
        type: dto.type,
        sourceKey: dto.sourceKey,
        templateId: dto.templateId ?? null,
        captionVariants: dto.captionVariants as unknown as object,
        languages: dto.languages,
        targetOrgUnitId: dto.targetOrgUnitId ?? null,
        createdById: userId,
        aiLabeled: true, // personalized renders are synthetic — labelled by default
      },
    });
  }

  async listAll() {
    return this.prisma.creative.findMany({
      orderBy: { createdAt: "desc" },
      include: { template: { select: { id: true, name: true } } },
    });
  }

  async get(id: string) {
    const c = await this.prisma.creative.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Creative not found");
    return c;
  }

  /** Set MCMC certification (and id) so the creative can pass the publish gate. */
  async certify(id: string, mcmcCertId: string) {
    await this.get(id);
    return this.prisma.creative.update({
      where: { id },
      data: { mcmcCertified: true, mcmcCertId },
    });
  }

  /** Compliance-gated publish. Pushes a notification to the target org topic. */
  async publish(id: string) {
    const c = await this.get(id);
    this.compliance.assertPublishable(c);
    const updated = await this.prisma.creative.update({
      where: { id },
      data: { published: true, publishedAt: new Date() },
    });
    const topic = c.targetOrgUnitId ? `org_${c.targetOrgUnitId}` : "org_all";
    await this.push.sendToTopic(topic, {
      title: "New content to share",
      body: c.title,
      data: { creativeId: c.id },
    });
    return updated;
  }

  captionFor(captionVariants: unknown, lang: string): string {
    const cv = (captionVariants ?? {}) as CaptionVariants;
    return cv[lang as keyof CaptionVariants] ?? cv.te ?? cv.en ?? "";
  }
}
