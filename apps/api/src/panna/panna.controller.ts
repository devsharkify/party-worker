import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PannaService } from "./panna.service";

@Controller("panna")
@UseGuards(JwtAuthGuard)
export class PannaController {
  constructor(private readonly panna: PannaService) {}

  /** The signed-in worker's own assigned voters. */
  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.panna.myPanna(user);
  }

  /** Leader: per-worker coverage for a booth / subtree. */
  @Get("coverage")
  coverage(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId?: string) {
    return this.panna.coverage(user, orgUnitId);
  }

  @Post("assign")
  assign(
    @CurrentUser() user: AuthUser,
    @Body() body: { workerId: string; voterIds: string[] },
  ) {
    return this.panna.assign(user, body);
  }

  @Post("unassign")
  unassign(@CurrentUser() user: AuthUser, @Body() body: { voterIds: string[] }) {
    return this.panna.unassign(user, body);
  }

  @Patch("mine/:voterId/knows")
  setKnows(
    @CurrentUser() user: AuthUser,
    @Param("voterId") voterId: string,
    @Body() body: { knowsPersonally: boolean },
  ) {
    return this.panna.setKnowsPersonally(user, voterId, body.knowsPersonally === true);
  }
}
