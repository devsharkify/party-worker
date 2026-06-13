import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { createCreativeSchema, type CreateCreativeDto } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CreativesService } from "./creatives.service";

const certifySchema = z.object({ mcmcCertId: z.string().min(3) });

const submitSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["image", "video"]).default("video"),
  sourceKey: z.string().min(1),
  thumbnailKey: z.string().optional(),
  captionVariants: z.object({ te: z.string().default(""), en: z.string().default("") }),
  videoDurationSec: z.number().int().positive().optional(),
});
const rejectSchema = z.object({ note: z.string().max(300).optional() });
const approveSchema = z.object({
  /** Reviewer may polish the caption before it goes live. */
  captionVariants: z.object({ te: z.string().default(""), en: z.string().default("") }).optional(),
});
const ALL_ROLES = [
  "worker",
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
] as const;
const REVIEWER_ROLES = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
] as const;

@ApiTags("creatives")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("creatives")
export class CreativesController {
  constructor(private readonly creatives: CreativesService) {}

  // ─── Worker submissions + leader/admin approval ─────────────────────────────

  /** Worker submits a video for review (all roles). */
  @Post("submit")
  @Roles(...ALL_ROLES)
  submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(submitSchema)) dto: z.infer<typeof submitSchema>,
  ) {
    return this.creatives.submit(user, dto);
  }

  /** The caller's own submissions + status (all roles). */
  @Get("submissions/mine")
  @Roles(...ALL_ROLES)
  mySubmissions(@CurrentUser() user: AuthUser) {
    return this.creatives.mySubmissions(user.id);
  }

  /** Pending submissions to review (leaders: own area; HQ/state: all). */
  @Get("submissions")
  @Roles(...REVIEWER_ROLES)
  submissions(@CurrentUser() user: AuthUser) {
    return this.creatives.listSubmissions(user);
  }

  @Post("submissions/:id/approve")
  @Roles(...REVIEWER_ROLES)
  approve(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(approveSchema)) dto: z.infer<typeof approveSchema>,
  ) {
    return this.creatives.approveSubmission(user, id, dto.captionVariants);
  }

  @Post("submissions/:id/reject")
  @Roles(...REVIEWER_ROLES)
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectSchema)) dto: z.infer<typeof rejectSchema>,
  ) {
    return this.creatives.rejectSubmission(user, id, dto.note);
  }

  /** MIME types accepted by the media upload endpoint. */
  private static readonly UPLOAD_MIME_WHITELIST = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
  ]);

  /**
   * Open to all authenticated roles (method-level @Roles overrides the
   * class-level admin restriction): workers upload their composited
   * banner-share images here before publishing to Instagram.
   */
  @Post("upload")
  @Roles(
    "worker",
    "booth_leader",
    "mandal_leader",
    "constituency_leader",
    "district_leader",
    "state_admin",
    "hq_admin",
  )
  async upload(@Req() req: FastifyRequest) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException("No file uploaded");
    if (!CreativesController.UPLOAD_MIME_WHITELIST.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    const buffer: Buffer = await file.toBuffer();
    return this.creatives.storeUpload(buffer, file.mimetype, file.filename);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCreativeSchema)) dto: CreateCreativeDto,
  ) {
    return this.creatives.create(user.id, dto);
  }

  @Get()
  list() {
    return this.creatives.listAll();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.creatives.get(id);
  }

  @Post(":id/certify")
  certify(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(certifySchema)) dto: { mcmcCertId: string },
  ) {
    return this.creatives.certify(id, dto.mcmcCertId);
  }

  @Post(":id/publish")
  publish(@Param("id") id: string) {
    return this.creatives.publish(id);
  }

  @Patch(":id/publish")
  publishPatch(@Param("id") id: string) {
    return this.creatives.publish(id);
  }

  @Patch(":id/unpublish")
  unpublish(@Param("id") id: string) {
    return this.creatives.unpublish(id);
  }

  @Patch(":id/breaking")
  setBreaking(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ isBreaking: z.boolean() }))) dto: { isBreaking: boolean },
  ) {
    return this.creatives.setBreaking(id, dto.isBreaking);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.creatives.remove(id);
  }
}
