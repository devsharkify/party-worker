import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { TeamStatsService } from "./teamstats.service";
import type { TeamStats } from "./teamstats.types";

@ApiTags("team")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("team")
export class TeamStatsController {
  constructor(private readonly teamStats: TeamStatsService) {}

  /**
   * Rolled-up stats for a unit's whole subtree. Defaults to the caller's own
   * unit; HQ/state may pass any unitId, other leaders only units they own.
   */
  @Get("stats")
  stats(
    @CurrentUser() user: AuthUser,
    @Query("unitId") unitId?: string,
  ): Promise<TeamStats> {
    return this.teamStats.getTeamStats(user, unitId);
  }
}
