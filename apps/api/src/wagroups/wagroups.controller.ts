import { Controller, Get, Put, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { WaGroupsService } from "./wagroups.service";

@Controller("wa-groups")
@UseGuards(JwtAuthGuard)
export class WaGroupsController {
  constructor(private readonly waGroups: WaGroupsService) {}

  @Put(":orgUnitId")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin", "district_leader", "constituency_leader", "mandal_leader", "booth_leader")
  upsert(
    @Param("orgUnitId") orgUnitId: string,
    @Body() body: { link: string; label?: string },
  ) {
    return this.waGroups.upsert(orgUnitId, body.link, body.label);
  }

  @Get(":orgUnitId")
  getForUnit(@Param("orgUnitId") orgUnitId: string) {
    return this.waGroups.getForUnit(orgUnitId);
  }

  @Get(":orgUnitId/chain")
  getChain(@Param("orgUnitId") orgUnitId: string) {
    return this.waGroups.getChain(orgUnitId);
  }
}
