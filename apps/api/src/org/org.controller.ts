import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrgService } from "./org.service";

@ApiTags("org")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("org")
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get("tree")
  tree() {
    return this.org.getTree();
  }

  /** Election readiness: booth coverage gaps (active last 7 days). */
  @Get("booth-coverage")
  boothCoverage() {
    return this.org.getBoothCoverage();
  }
}
