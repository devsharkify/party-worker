import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createOrgUnitSchema,
  importMembersSchema,
  onboardMemberSchema,
  type CreateOrgUnitDto,
  type ImportMembersDto,
  type OnboardMemberDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TeamService } from "./team.service";
import { z } from "zod";

const designationSchema = z.object({ designation: z.string().max(60) });

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

  /** Bulk import members from an admin-uploaded Excel/CSV (HQ/state only). */
  @Post("members/import")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  importMembers(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(importMembersSchema)) dto: ImportMembersDto,
  ) {
    return this.team.importMembers(user, dto.rows);
  }

  /** Update a member's designation (leaders: own subtree; HQ/state: anyone). */
  @Patch("members/:id/designation")
  updateDesignation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(designationSchema)) dto: { designation: string },
  ) {
    return this.team.updateMemberDesignation(user, id, dto.designation);
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
