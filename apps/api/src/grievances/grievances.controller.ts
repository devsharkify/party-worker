import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createGrievanceSchema, type CreateGrievanceDto } from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GrievancesService } from "./grievances.service";

@ApiTags("grievances")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("grievances")
export class GrievancesController {
  constructor(private readonly grievances: GrievancesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGrievanceSchema)) dto: CreateGrievanceDto,
  ) {
    return this.grievances.create(user.id, dto);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.grievances.listMine(user.id);
  }

  /** Anonymized recent grievances from the worker's org subtree. */
  @Get("area")
  area(@CurrentUser() user: AuthUser) {
    return this.grievances.listArea(user.id);
  }

  /** Constituency failure report — open issues breakdown for the caller's subtree. */
  @Get("report")
  report(@CurrentUser() user: AuthUser) {
    return this.grievances.getReport(user.id);
  }

  /** Trigger the aging-poster scan immediately (admin / cron test). */
  @Post("aging-scan")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  agingScan() {
    return this.grievances.createAgingPosters();
  }
}
