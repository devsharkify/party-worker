import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  SchedulingService,
  type ScheduledCreativeRow,
  type ScheduleResult,
} from "./scheduling.service";

const scheduleSchema = z.object({ scheduledAt: z.string().datetime() });
type ScheduleDto = z.infer<typeof scheduleSchema>;

@ApiTags("scheduling")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("creatives")
export class CreativeSchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Post(":id/schedule")
  schedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleSchema)) dto: ScheduleDto,
  ): Promise<ScheduleResult> {
    return this.scheduling.schedule(id, dto.scheduledAt);
  }

  @Delete(":id/schedule")
  unschedule(@Param("id") id: string): Promise<ScheduleResult> {
    return this.scheduling.unschedule(id);
  }
}

@ApiTags("scheduling")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("admin")
export class AdminSchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get("scheduled")
  scheduled(): Promise<ScheduledCreativeRow[]> {
    return this.scheduling.listScheduled();
  }
}
