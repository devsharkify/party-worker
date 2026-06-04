import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ContentAnalyticsService } from "./content-analytics.service";
import { ContentAnalyticsController } from "./content-analytics.controller";

/**
 * HQ/state-admin content-performance analytics: per-creative share/reach/render
 * rollups and a top-amplifiers leaderboard. Routes are guarded by
 * JwtAuthGuard + RolesGuard('hq_admin','state_admin') at the controller level.
 */
@Module({
  imports: [SecurityModule],
  providers: [ContentAnalyticsService],
  controllers: [ContentAnalyticsController],
  exports: [ContentAnalyticsService],
})
export class ContentAnalyticsModule {}
