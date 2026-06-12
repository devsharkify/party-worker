import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { TeamStatsService } from "./teamstats.service";
import type { InactiveMember, TeamStats } from "./teamstats.types";

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

  /** Members idle `days`+ (default 7) in the subtree — the leader's call list. */
  @Get("inactive")
  inactive(
    @CurrentUser() user: AuthUser,
    @Query("unitId") unitId?: string,
    @Query("days") days?: string,
  ): Promise<InactiveMember[]> {
    const parsed = Number(days);
    return this.teamStats.getInactiveMembers(
      user,
      unitId,
      Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 7,
    );
  }
}
