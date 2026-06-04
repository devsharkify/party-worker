import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  checkInEventSchema,
  rsvpEventSchema,
  type CheckInEventDto,
  type RsvpEventDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EventsService } from "./events.service";

@ApiTags("events")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.events.listUpcoming(user.id);
  }

  @Post(":id/rsvp")
  rsvp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rsvpEventSchema)) dto: RsvpEventDto,
  ) {
    return this.events.rsvp(user.id, id, dto.status);
  }

  @Post(":id/checkin")
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(checkInEventSchema)) dto: CheckInEventDto,
  ) {
    return this.events.checkIn(user.id, id, dto.qrToken);
  }
}
