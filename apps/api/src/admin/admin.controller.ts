import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  GrievanceStatus,
  updateGrievanceStatusSchema,
  adminUpdateUserSchema,
  adminCreateNewsSchema,
  type AdminGrievanceRow,
  type AdminStats,
  type AdminUserRow,
  type AdminUpdateUserDto,
  type NewsItem,
  type MaintenanceResult,
  type UpdateGrievanceStatusDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  stats(): Promise<AdminStats> {
    return this.admin.getStats();
  }

  @Get("grievances")
  grievances(@Query("status") status?: string): Promise<AdminGrievanceRow[]> {
    let parsed: GrievanceStatus | undefined;
    if (status !== undefined && status !== "") {
      const res = GrievanceStatus.safeParse(status);
      if (!res.success) throw new BadRequestException("Invalid grievance status filter");
      parsed = res.data;
    }
    return this.admin.listGrievances(parsed);
  }

  @Patch("grievances/:id")
  updateGrievance(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateGrievanceStatusSchema)) dto: UpdateGrievanceStatusDto,
  ): Promise<AdminGrievanceRow> {
    return this.admin.updateGrievanceStatus(id, dto.status);
  }

  @Post("scoring/weekly-reset")
  weeklyReset(): Promise<MaintenanceResult> {
    return this.admin.resetWeekly();
  }

  @Post("scoring/decay")
  decay(): Promise<MaintenanceResult> {
    return this.admin.applyDecay();
  }

  /** List all users — supports ?search=, ?role=, ?orgUnitId= filters */
  @Get("users")
  listUsers(
    @Query("search") search?: string,
    @Query("role") role?: string,
    @Query("orgUnitId") orgUnitId?: string,
  ): Promise<AdminUserRow[]> {
    return this.admin.listUsers({ search, role, orgUnitId });
  }

  /** Update a user's role, orgUnit, name, or designation */
  @Patch("users/:id")
  updateUser(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema)) dto: AdminUpdateUserDto,
  ): Promise<AdminUserRow> {
    return this.admin.updateUser(id, dto);
  }

  /** Create a news item */
  @Post("news")
  createNews(
    @Body(new ZodValidationPipe(adminCreateNewsSchema)) dto: any,
  ): Promise<NewsItem> {
    return this.admin.createNews(dto);
  }

  /** List all news items */
  @Get("news")
  listNews(): Promise<NewsItem[]> {
    return this.admin.listNews();
  }

  /**
   * All org units (full tree, unscoped) — used by the admin People section to
   * populate the unit reassignment picker for any user, regardless of the admin's
   * own subtree.
   */
  @Get("org-units")
  listOrgUnits() {
    return this.admin.listOrgUnits();
  }

  /**
   * Search workers by skill and/or language for task assignment.
   * At least one query param (skill, lang, or availability) is recommended.
   * Optional: orgUnitId to scope to a subtree.
   */
  @Get("workers/skills-search")
  searchWorkersBySkill(
    @Query("skill") skill?: string,
    @Query("lang") lang?: string,
    @Query("availability") availability?: string,
    @Query("orgUnitId") orgUnitId?: string,
  ) {
    return this.admin.searchWorkersBySkill({ skill, lang, availability, orgUnitId });
  }
}
