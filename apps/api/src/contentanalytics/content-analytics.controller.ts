import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ContentAnalyticsService } from "./content-analytics.service";
import type {
  ContentPerformanceRow,
  TopAmplifierRow,
} from "./content-analytics.types";

/**
 * HQ/state-admin content-performance analytics. All routes guarded at the
 * controller level by JwtAuthGuard + RolesGuard('hq_admin','state_admin').
 */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("admin")
export class ContentAnalyticsController {
  constructor(private readonly analytics: ContentAnalyticsService) {}

  /** Per published creative: shares, verified reach, and personalized renders. */
  @Get("content-performance")
  contentPerformance(@CurrentUser() _user: AuthUser): Promise<ContentPerformanceRow[]> {
    return this.analytics.contentPerformance();
  }

  /** Top 10 workers ranked by total verified reach. */
  @Get("top-amplifiers")
  topAmplifiers(@CurrentUser() _user: AuthUser): Promise<TopAmplifierRow[]> {
    return this.analytics.topAmplifiers();
  }
}
