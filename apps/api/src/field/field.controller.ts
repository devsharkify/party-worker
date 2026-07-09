import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { FieldService } from "./field.service";

@Controller("field")
@UseGuards(JwtAuthGuard)
export class FieldController {
  constructor(private readonly field: FieldService) {}

  @Post("location")
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Body() body: { latitude: number; longitude: number; accuracy?: number; onDuty?: boolean },
  ) {
    return this.field.updateLocation(user, body);
  }

  @Post("duty")
  setDuty(@CurrentUser() user: AuthUser, @Body() body: { onDuty: boolean }) {
    return this.field.setDuty(user, body.onDuty === true);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.field.me(user);
  }

  @Get("team")
  team(@CurrentUser() user: AuthUser) {
    return this.field.team(user);
  }
}
