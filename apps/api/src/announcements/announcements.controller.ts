import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AnnouncementsService } from "./announcements.service";

const createAnnouncementBody = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  targetOrgUnitId: z.string().min(1).optional(),
});

type CreateAnnouncementBody = z.infer<typeof createAnnouncementBody>;

@ApiTags("announcements")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAnnouncementBody)) dto: CreateAnnouncementBody,
  ) {
    return this.announcements.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.list(user);
  }
}
