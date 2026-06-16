import { Controller, Get, Post, Put, Param, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CrisisService } from "./crisis.service";

@Controller("crisis")
@UseGuards(JwtAuthGuard)
export class CrisisController {
  constructor(private readonly crisis: CrisisService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader")
  activate(
    @Body() body: { title: string; message: string; orgUnitId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.crisis.activate(body, user.id);
  }

  @Put(":id/resolve")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader")
  resolve(@Param("id") id: string) {
    return this.crisis.resolve(id);
  }

  @Get("active")
  listActive() {
    return this.crisis.listActive();
  }
}
