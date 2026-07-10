import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { VotersService } from "./voters.service";

@Controller("voters")
@UseGuards(JwtAuthGuard)
export class VotersController {
  constructor(private readonly voters: VotersService) {}

  @Get("access")
  access(@CurrentUser() user: AuthUser) {
    return this.voters.access(user);
  }

  @Get("units")
  units(@CurrentUser() user: AuthUser) {
    return this.voters.units(user);
  }

  @Get("list")
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    q: { orgUnitId?: string; status?: string; gender?: string; q?: string; page?: number; pageSize?: number },
  ) {
    return this.voters.list(user, q);
  }

  @Get("search")
  search(
    @CurrentUser() user: AuthUser,
    @Query() q: { q?: string; page?: number; pageSize?: number },
  ) {
    return this.voters.search(user, q);
  }

  @Get("stats")
  stats(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.voters.stats(user, orgUnitId);
  }

  @Get("imports")
  imports(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.voters.imports(user, orgUnitId);
  }

  @Post("import")
  import(
    @CurrentUser() user: AuthUser,
    @Body() body: { boothId: string; filename?: string; csvText: string },
  ) {
    return this.voters.import(user, body);
  }

  @Post("bulk-update")
  bulkUpdate(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids: string[]; votingStatus: string },
  ) {
    return this.voters.bulkUpdate(user, body);
  }

  // ---- surveys (declared before detail/:id-style params for route clarity) --

  @Post("surveys")
  createSurvey(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.voters.createSurvey(user, body);
  }

  @Get("surveys/mine")
  mySurveys(@CurrentUser() user: AuthUser) {
    return this.voters.mySurveys(user);
  }

  @Get("surveys/stats")
  surveyStats(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.voters.surveyStats(user, orgUnitId);
  }

  @Get("surveys")
  surveys(
    @CurrentUser() user: AuthUser,
    @Query() q: { orgUnitId?: string; page?: number; pageSize?: number },
  ) {
    return this.voters.surveys(user, q);
  }

  // ---- access grants + audit ----------------------------------------------

  @Get("grants")
  grants(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.voters.grants(user, orgUnitId);
  }

  @Patch("grants/:userId")
  setGrant(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.voters.setGrant(user, userId, body.enabled === true);
  }

  @Get("access-logs")
  accessLogs(
    @CurrentUser() user: AuthUser,
    @Query() q: { page?: number; pageSize?: number; userId?: string },
  ) {
    return this.voters.accessLogs(user, q);
  }

  // ---- change history -------------------------------------------------------

  @Get("changes/mine")
  changesMine(@CurrentUser() user: AuthUser) {
    return this.voters.changesMine(user);
  }

  @Get("detail/:id/history")
  history(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.voters.history(user, id);
  }

  // ---- detail last (parameterized) -----------------------------------------

  @Get("detail/:id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.voters.detail(user, id);
  }

  @Patch("detail/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body()
    body: {
      votingStatus?: string;
      mobile?: string;
      notes?: string;
      isVoted?: boolean;
      latitude?: number;
      longitude?: number;
    },
  ) {
    return this.voters.update(user, id, body);
  }
}
