import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ActivityService } from "./activity.service";

@ApiTags("activity")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("me/activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.activity.getActivity(user.id, limit);
  }
}
