import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  GrievanceStatus,
  updateGrievanceStatusSchema,
  type AdminGrievanceRow,
  type AdminStats,
  type MaintenanceResult,
  type UpdateGrievanceStatusDto,
} from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  stats(): Promise<AdminStats> {
    return this.admin.getStats();
  }

  @Get("grievances")
  grievances(@Query("status") status?: string): Promise<AdminGrievanceRow[]> {
    let parsed: GrievanceStatus | undefined;
    if (status !== undefined && status !== "") {
      const res = GrievanceStatus.safeParse(status);
      if (!res.success) throw new BadRequestException("Invalid grievance status filter");
      parsed = res.data;
    }
    return this.admin.listGrievances(parsed);
  }

  @Patch("grievances/:id")
  updateGrievance(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateGrievanceStatusSchema)) dto: UpdateGrievanceStatusDto,
  ): Promise<AdminGrievanceRow> {
    return this.admin.updateGrievanceStatus(id, dto.status);
  }

  @Post("scoring/weekly-reset")
  weeklyReset(): Promise<MaintenanceResult> {
    return this.admin.resetWeekly();
  }

  @Post("scoring/decay")
  decay(): Promise<MaintenanceResult> {
    return this.admin.applyDecay();
  }
}
