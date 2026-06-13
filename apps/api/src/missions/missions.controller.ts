import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MissionsService } from "./missions.service";

const createMissionSchema = z.object({
  title: z.string().min(1).max(100),
  caption: z.string().max(300).optional(),
  hashtag: z.string().max(60).optional(),
  creativeId: z.string().optional(),
  bonusPoints: z.number().int().positive().default(10),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

type CreateMissionDto = z.infer<typeof createMissionSchema>;

@ApiTags("missions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("missions")
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  /** Active + upcoming missions for the calling worker. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.missions.list(user.id);
  }

  /** Admin: all missions including expired. */
  @Get("all")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  listAll() {
    return this.missions.listAll();
  }

  /** Admin: create a timed mission. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMissionSchema)) dto: CreateMissionDto,
  ) {
    return this.missions.create({ ...dto, createdById: user.id });
  }

  /** Worker: mark a mission complete (awards bonus if window is active). */
  @Post(":id/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.missions.complete(user.id, id);
  }
}
