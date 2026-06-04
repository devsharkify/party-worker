import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  checkInEventSchema,
  createEventSchema,
  rsvpEventSchema,
  type CheckInEventDto,
  type CreateEventDto,
  type RsvpEventDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
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

  /** Admin: create an event. QR token is generated server-side. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(@Body(new ZodValidationPipe(createEventSchema)) dto: CreateEventDto) {
    return this.events.create(dto);
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
