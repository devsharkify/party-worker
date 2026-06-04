import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createTemplateSchema, type CreateTemplateDto } from "@pw/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TemplatesService } from "./templates.service";

@ApiTags("templates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  // read templates: any authenticated user (the app needs them to render)
  @Get()
  list() {
    return this.templates.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.templates.get(id);
  }

  @Post()
  @Roles("hq_admin", "state_admin")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTemplateSchema)) dto: CreateTemplateDto,
  ) {
    return this.templates.create(user.id, dto);
  }
}
