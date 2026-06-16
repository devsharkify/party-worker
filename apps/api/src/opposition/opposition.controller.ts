import { Controller, Get, Post, Put, Param, Body, UseGuards, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OppositionService } from "./opposition.service";

@Controller("opposition")
@UseGuards(JwtAuthGuard)
export class OppositionController {
  constructor(private readonly opposition: OppositionService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(@Body() body: { party: string; headline: string; details?: string }, @CurrentUser() user: AuthUser) {
    return this.opposition.create(body, user.id);
  }

  @Get()
  list(@Query("limit") limit?: string) {
    return this.opposition.list(limit ? parseInt(limit, 10) : 30);
  }

  @Put(":id/response")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader")
  addResponse(@Param("id") id: string, @Body("trsResponse") trsResponse: string) {
    return this.opposition.addResponse(id, trsResponse);
  }
}
