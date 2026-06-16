import { Controller, Get, Post, Param, Body, UseGuards, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { BoothTasksService } from "./boothtasks.service";

@Controller("booth-tasks")
@UseGuards(JwtAuthGuard)
export class BoothTasksController {
  constructor(private readonly tasks: BoothTasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader", "mandal_leader", "booth_leader")
  create(
    @Body() body: { title: string; description?: string; assignedToId?: string; dueAt?: string; orgUnitId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.create(body, user.id, body.orgUnitId);
  }

  @Get()
  list(@Query("orgUnitId") orgUnitId: string) {
    return this.tasks.list(orgUnitId);
  }

  @Get("mine")
  myTasks(@CurrentUser() user: AuthUser, @Query("orgUnitId") orgUnitId: string) {
    return this.tasks.myTasks(user.id, orgUnitId);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body("note") note: string, @CurrentUser() user: AuthUser) {
    return this.tasks.complete(id, user.id, note);
  }

  @Get("report")
  report(@Query("orgUnitId") orgUnitId: string) {
    return this.tasks.report(orgUnitId);
  }
}
