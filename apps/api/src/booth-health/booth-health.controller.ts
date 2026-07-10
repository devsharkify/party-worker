import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { BoothHealthService } from "./booth-health.service";

@Controller("booth-health")
@UseGuards(JwtAuthGuard)
export class BoothHealthController {
  constructor(private readonly service: BoothHealthService) {}

  /** Per-booth scorecard for the leader's subtree (or a chosen unit), worst-first. */
  @Get()
  dashboard(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.service.dashboard(user, orgUnitId);
  }
}
