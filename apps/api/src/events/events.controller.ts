import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  checkInEventSchema,
  createEventSchema,
  updateEventSchema,
  rsvpEventSchema,
  type CheckInEventDto,
  type CreateEventDto,
  type UpdateEventDto,
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

  /** Admin: update an event. */
  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  updateEvent(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) dto: UpdateEventDto,
  ) {
    return this.events.update(id, dto);
  }

  /** Admin: delete an event. */
  @Delete(":id")
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  deleteEvent(@Param("id") id: string) {
    return this.events.delete(id);
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
    return this.events.checkIn(user.id, id, dto.qrToken, dto.lat, dto.lng);
  }

  /** Leader/admin: attendance list for an event. */
  @Get(":id/attendance")
  @UseGuards(RolesGuard)
  @Roles("booth_leader", "mandal_leader", "constituency_leader", "district_leader", "state_admin", "hq_admin")
  getAttendance(@Param("id") id: string) {
    return this.events.getAttendance(id);
  }
}
