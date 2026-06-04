import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createOrgUnitSchema,
  onboardMemberSchema,
  type CreateOrgUnitDto,
  type OnboardMemberDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TeamService } from "./team.service";

@ApiTags("org")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("org")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** Units this user may create under / onboard into (their subtree; all for HQ/state). */
  @Get("manageable")
  manageable(@CurrentUser() user: AuthUser) {
    return this.team.manageableUnits(user);
  }

  /** Create a new child org unit (a new audience / team). */
  @Post("units")
  createUnit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrgUnitSchema)) dto: CreateOrgUnitDto,
  ) {
    return this.team.createUnit(user, dto);
  }

  /** Onboard a member (worker or sub-leader) into a unit you manage. */
  @Post("members")
  onboard(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(onboardMemberSchema)) dto: OnboardMemberDto,
  ) {
    return this.team.onboardMember(user, dto);
  }

  /** Roster for a unit (add ?subtree=true to include the whole subtree). */
  @Get("units/:id/members")
  members(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("subtree") subtree?: string,
  ) {
    return this.team.listMembers(user, id, subtree === "true");
  }
}
