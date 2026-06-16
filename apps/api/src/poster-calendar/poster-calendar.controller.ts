import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PosterCalendarService } from "./poster-calendar.service";

const createSchema = z.object({
  date: z.coerce.date(),
  title: z.string().min(1),
  pushTitle: z.string().min(1),
  pushBody: z.string().min(1),
  creativeId: z.string().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags("calendar")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("calendar")
export class PosterCalendarController {
  constructor(private readonly cal: PosterCalendarService) {}

  @Get()
  list() { return this.cal.list(); }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) dto: CreateDto) {
    return this.cal.create(dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) { return this.cal.remove(id); }

  /** Manually trigger today's calendar pushes (useful for testing). */
  @Post("send-today")
  sendToday() { return this.cal.sendToday(); }
}
