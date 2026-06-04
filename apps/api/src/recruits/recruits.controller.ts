import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { RecruitsService } from "./recruits.service";

/** The recruiter's own view of who they brought in (the growth loop). */
@ApiTags("recruits")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("me/recruits")
export class RecruitsController {
  constructor(private readonly recruits: RecruitsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.recruits.listForRecruiter(user.id);
  }
}

/** Admin-only maintenance: pay out the delayed second-half recruit bonus. */
@ApiTags("recruits")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("admin/recruits")
export class RecruitsAdminController {
  constructor(private readonly recruits: RecruitsService) {}

  @Post("process-bonus")
  processBonus() {
    return this.recruits.processBonus();
  }
}
