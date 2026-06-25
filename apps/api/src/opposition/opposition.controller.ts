import { Controller, Get, Post, Put, Param, Body, UseGuards, Query, ParseIntPipe, DefaultValuePipe } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OppositionService, type CreateActivityDto } from "./opposition.service";

@Controller("opposition")
@UseGuards(JwtAuthGuard)
export class OppositionController {
  constructor(private readonly opposition: OppositionService) {}

  // ── Legacy OppositionItem endpoints ──────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(@Body() body: { party: string; headline: string; details?: string }, @CurrentUser() user: AuthUser) {
    return this.opposition.create(body, user.id);
  }

  @Get()
  list(@Query("limit") limit?: string) {
    return this.opposition.list(limit ? parseInt(limit, 10) : 30);
  }

  @Put(":id/response")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader")
  addResponse(@Param("id") id: string, @Body("trsResponse") trsResponse: string) {
    return this.opposition.addResponse(id, trsResponse);
  }

  // ── Activity Feed endpoints ───────────────────────────────────────────────

  @Post("activities")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  createActivity(@Body() body: CreateActivityDto, @CurrentUser() user: AuthUser) {
    return this.opposition.createActivity(body, user.id);
  }

  @Get("activities")
  listActivities(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("partyName") partyName?: string,
    @Query("activityType") activityType?: string,
  ) {
    return this.opposition.listActivities({ page, limit, partyName, activityType });
  }

  @Get("daily-brief")
  getDailyBrief() {
    return this.opposition.getDailyBrief();
  }
}
