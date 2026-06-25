import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ManifestoService } from "./manifesto.service";

const VALID_CATEGORIES = ["infrastructure", "welfare", "education", "health", "economy"] as const;
const VALID_STATUSES = ["promised", "in_progress", "completed", "delayed"] as const;

const createManifestoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.enum(VALID_CATEGORIES),
  status: z.enum(VALID_STATUSES).default("promised"),
  progressPct: z.number().int().min(0).max(100).default(0),
  targetDate: z.string().datetime().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(VALID_STATUSES),
  progressPct: z.number().int().min(0).max(100).optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

type CreateManifestoDto = z.infer<typeof createManifestoSchema>;
type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

@ApiTags("manifesto")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("manifesto")
export class ManifestoController {
  constructor(private readonly manifesto: ManifestoService) {}

  /**
   * GET /manifesto
   * Public (any authenticated worker) — list all policy promises with current status.
   * Mirrors how BJP NaMo app surfaces promises to party volunteers and how
   * Labour's digital platform exposes policy progress to members.
   */
  @Get()
  list() {
    return this.manifesto.list();
  }

  /**
   * POST /manifesto
   * Admin only — create a new party manifesto promise/policy item.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createManifestoSchema)) dto: CreateManifestoDto,
  ) {
    return this.manifesto.create(user, dto);
  }

  /**
   * PATCH /manifesto/:id/status
   * Admin only — update status and progress percentage on a manifesto item.
   * Auto-sets completedAt when status transitions to "completed".
   */
  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) dto: UpdateStatusDto,
  ) {
    return this.manifesto.updateStatus(user, id, dto);
  }
}
