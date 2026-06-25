import { Controller, Get, Post, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CanvassRoutesService, CreateRouteDto, AssignRouteDto } from "./canvass-routes.service";

@Controller("canvass-routes")
@UseGuards(JwtAuthGuard)
export class CanvassRoutesController {
  constructor(private readonly service: CanvassRoutesService) {}

  /** Admin: create a canvassing route for a booth */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader", "mandal_leader", "booth_leader")
  create(@Body() body: CreateRouteDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user.id);
  }

  /** Get all routes for a booth */
  @Get("booth/:boothId")
  listByBooth(@Param("boothId") boothId: string) {
    return this.service.listByBooth(boothId);
  }

  /** Admin: assign route to a worker */
  @Patch(":id/assign")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader", "mandal_leader", "booth_leader")
  assign(@Param("id") id: string, @Body() body: AssignRouteDto) {
    return this.service.assign(id, body);
  }

  /** Worker: mark their assigned route as completed */
  @Patch(":id/complete")
  complete(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.complete(id, user.id);
  }
}
