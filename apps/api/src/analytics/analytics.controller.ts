import {
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsService } from "./analytics.service";
import type {
  HeatmapRow,
  TopCreativeRow,
  MyAnalytics,
} from "./analytics.service";

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Constituency-level heatmap: total reach per OrgUnit.
   * HQ/state admins only.
   */
  @Get("analytics/heatmap")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  getHeatmap(
    @Query("orgUnitType") orgUnitType?: string,
  ): Promise<HeatmapRow[]> {
    return this.analytics.getHeatmap(orgUnitType ?? "constituency");
  }

  /**
   * Top creatives ranked by total reach.
   * HQ/state admins only.
   */
  @Get("analytics/top-creatives")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  getTopCreatives(
    @Query("limit") limit?: string,
  ): Promise<TopCreativeRow[]> {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.analytics.getTopCreatives(Number.isFinite(n) && n > 0 ? n : 10);
  }

  /**
   * Personal analytics for the current authenticated user.
   * Any authenticated worker/leader may call this.
   */
  @Get("me/analytics")
  getMyAnalytics(@CurrentUser() user: AuthUser): Promise<MyAnalytics> {
    return this.analytics.getMyAnalytics(user.id);
  }
}
