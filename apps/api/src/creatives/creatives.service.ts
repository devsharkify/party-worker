import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CaptionVariants, CreateCreativeDto } from "@pw/shared";
import { LEADER_ROLES, type Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceService } from "../compliance/compliance.service";
import { OrgService } from "../org/org.service";
import { PushService } from "../push/push.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import { newId } from "../auth/crypto.util";
import type { AuthUser } from "../auth/auth.types";

@Injectable()
export class CreativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly org: OrgService,
    private readonly push: PushService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Notify the target audience (subtree, or everyone) that a creative went
   * live — fires for ALL creative types, the heartbeat of the daily loop.
   * Best-effort: a push failure must never block the publish.
   */
  private async notifyPublished(targetOrgUnitId: string | null, title: string, creativeId: string) {
    const pushTitle = "కొత్త పోస్టర్ వచ్చింది — షేర్ చేయండి!";
    const data = { type: "creative_published", creativeId };
    if (targetOrgUnitId) {
      await this.push.pushToOrgUnit(targetOrgUnitId, pushTitle, title, data).catch(() => undefined);
    } else {
      await this.push.pushToAllUsers(pushTitle, title, data).catch(() => undefined);
    }
  }

  // ─── Worker submissions + approval ──────────────────────────────────────────

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  /** A worker submits content (video or poster) for review. Lands as pending. */
  async submit(
    user: AuthUser,
    dto: { title: string; type?: "image" | "video"; sourceKey: string; thumbnailKey?: string; captionVariants: CaptionVariants; videoDurationSec?: number },
  ) {
    const submitter = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.prisma.creative.create({
      data: {
        title: dto.title,
        type: dto.type ?? "video",
        sourceKey: dto.sourceKey,
        thumbnailKey: dto.thumbnailKey ?? null,
        captionVariants: dto.captionVariants as unknown as object,
        languages: ["te", "en"],
        videoDurationSec: dto.videoDurationSec ?? null,
        createdById: user.id,
        submittedById: user.id,
        submissionStatus: "pending",
        // route review to the submitter's own org unit (leaders see their area)
        targetOrgUnitId: submitter.orgUnitId,
        published: false,
        aiLabeled: true,
      },
    });
  }

  /** Pending submissions a reviewer may act on (their subtree; all for HQ/state). */
  async listSubmissions(user: AuthUser) {
    if (!this.isGlobal(user.role) && !LEADER_ROLES.includes(user.role)) {
      throw new ForbiddenException("Only leaders or admins can review submissions.");
    }
    let where: Record<string, unknown> = { submissionStatus: "pending" };
    if (!this.isGlobal(user.role)) {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const subtree = await this.org.getDescendantIds(me.orgUnitId);
      where = { ...where, submittedBy: { orgUnitId: { in: subtree } } };
    }
    const rows = await this.prisma.creative.findMany({
      where,
      include: { submittedBy: { select: { name: true, orgUnit: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      sourceUrl: this.storage.publicUrl(c.sourceKey),
      thumbnailUrl: c.thumbnailKey ? this.storage.publicUrl(c.thumbnailKey) : null,
      videoDurationSec: c.videoDurationSec,
      captionVariants: c.captionVariants,
      submittedByName: c.submittedBy?.name ?? "Unknown",
      submittedByUnit: c.submittedBy?.orgUnit?.name ?? null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  private async assertCanReview(user: AuthUser, creativeId: string) {
    const c = await this.prisma.creative.findUnique({
      where: { id: creativeId },
      include: { submittedBy: true },
    });
    if (!c) throw new NotFoundException("Submission not found.");
    if (c.submissionStatus !== "pending") throw new ForbiddenException("This submission was already reviewed.");
    if (this.isGlobal(user.role)) return c;
    if (!LEADER_ROLES.includes(user.role)) throw new ForbiddenException("Not allowed to review.");
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const subtree = await this.org.getDescendantIds(me.orgUnitId);
    if (!c.submittedBy || !subtree.includes(c.submittedBy.orgUnitId)) {
      throw new ForbiddenException("You can only review submissions from your own area.");
    }
    return c;
  }

  /** Approve a submission — publishes it to the feed for everyone. */
  async approveSubmission(user: AuthUser, creativeId: string, captionVariants?: CaptionVariants) {
    await this.assertCanReview(user, creativeId);
    const updated = await this.prisma.creative.update({
      where: { id: creativeId },
      data: {
        submissionStatus: "approved",
        reviewedById: user.id,
        reviewedAt: new Date(),
        published: true,
        publishedAt: new Date(),
        // Reviewer-polished caption wins over the submitter's draft.
        ...(captionVariants ? { captionVariants: captionVariants as unknown as object } : {}),
      },
    });
    await this.notifyPublished(updated.targetOrgUnitId, updated.title, updated.id);
    return { id: updated.id, status: "approved" };
  }

  /** Reject a submission with an optional note. */
  async rejectSubmission(user: AuthUser, creativeId: string, note?: string) {
    await this.assertCanReview(user, creativeId);
    await this.prisma.creative.update({
      where: { id: creativeId },
      data: {
        submissionStatus: "rejected",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
        published: false,
      },
    });
    return { id: creativeId, status: "rejected" };
  }

  /** A worker's own submissions with their current review status. */
  async mySubmissions(userId: string) {
    const rows = await this.prisma.creative.findMany({
      where: { submittedById: userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.submissionStatus,
      reviewNote: c.reviewNote,
      thumbnailUrl: c.thumbnailKey ? this.storage.publicUrl(c.thumbnailKey) : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

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
        videoDurationSec: dto.videoDurationSec ?? null,
        thumbnailKey: dto.thumbnailKey ?? null,
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

    if (c.isBreaking) {
      // Breaking news — always push to everyone regardless of target scope.
      const breakingTitle = "🚨 Breaking: " + c.title;
      void this.push.pushToAllUsers(breakingTitle, c.title, {
        type: "creative_published",
        creativeId: c.id,
        isBreaking: "true",
      }).catch(() => undefined);
    } else {
      await this.notifyPublished(c.targetOrgUnitId, c.title, c.id);
    }

    return updated;
  }

  /** Toggle the breaking flag — can be set before or after publish. */
  async setBreaking(id: string, isBreaking: boolean) {
    await this.get(id);
    return this.prisma.creative.update({
      where: { id },
      data: { isBreaking },
    });
  }

  /** Unpublish a creative — moves it back to draft state. */
  async unpublish(id: string) {
    await this.get(id);
    return this.prisma.creative.update({
      where: { id },
      data: { published: false, publishedAt: null },
    });
  }

  /** Hard-delete a creative. Irreversible. */
  async remove(id: string) {
    await this.get(id);
    await this.prisma.creative.delete({ where: { id } });
    return { deleted: true };
  }

  captionFor(captionVariants: unknown, lang: string): string {
    const cv = (captionVariants ?? {}) as CaptionVariants;
    return cv[lang as keyof CaptionVariants] ?? cv.te ?? cv.en ?? "";
  }
}
