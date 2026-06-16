import { Controller, Get, Post, Param, Body, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PollsService } from "./polls.service";

@Controller("polls")
@UseGuards(JwtAuthGuard)
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader", "mandal_leader", "booth_leader")
  create(@Body() body: { question: string; optionA?: string; optionB?: string; orgUnitId?: string; endsAt: string }, @CurrentUser() user: AuthUser) {
    return this.polls.create(body, user.id);
  }

  @Get()
  list(@Query("orgUnitId") orgUnitId?: string) {
    return this.polls.list(orgUnitId);
  }

  @Get(":id/results")
  results(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.polls.results(id, user.id);
  }

  @Post(":id/vote")
  vote(@Param("id") id: string, @Body("choice") choice: "A" | "B", @CurrentUser() user: AuthUser) {
    return this.polls.vote(id, user.id, choice);
  }
}
