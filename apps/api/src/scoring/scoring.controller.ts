import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { OrgUnitType } from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ScoringService } from "./scoring.service";

@ApiTags("scoring")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("scoring")
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.scoring.getScoreSummary(user.id);
  }

  @Get("leaderboard")
  @ApiQuery({ name: "level", enum: ["state", "district", "constituency", "mandal", "booth"] })
  leaderboard(@CurrentUser() user: AuthUser, @Query("level") level?: string) {
    const parsed = OrgUnitType.safeParse(level ?? "booth");
    return this.scoring.getLeaderboard(user.id, parsed.success ? parsed.data : "booth");
  }

  @Get("pool")
  pool(@CurrentUser() user: AuthUser) {
    return this.scoring.getPool(user.id);
  }

  @Get("badges")
  badges(@CurrentUser() user: AuthUser) {
    return this.scoring.getBadges(user.id);
  }

  @Post("constituency-failure")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  constituencyFailure() {
    return this.scoring.postConstituencyFailureReport();
  }
}
