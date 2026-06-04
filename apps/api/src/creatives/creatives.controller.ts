import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { createCreativeSchema, type CreateCreativeDto } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CreativesService } from "./creatives.service";

const certifySchema = z.object({ mcmcCertId: z.string().min(3) });

@ApiTags("creatives")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("hq_admin", "state_admin")
@Controller("creatives")
export class CreativesController {
  constructor(private readonly creatives: CreativesService) {}

  @Post("upload")
  async upload(@Req() req: FastifyRequest) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException("No file uploaded");
    const buffer: Buffer = await file.toBuffer();
    return this.creatives.storeUpload(buffer, file.mimetype, file.filename);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCreativeSchema)) dto: CreateCreativeDto,
  ) {
    return this.creatives.create(user.id, dto);
  }

  @Get()
  list() {
    return this.creatives.listAll();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.creatives.get(id);
  }

  @Post(":id/certify")
  certify(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(certifySchema)) dto: { mcmcCertId: string },
  ) {
    return this.creatives.certify(id, dto.mcmcCertId);
  }

  @Post(":id/publish")
  publish(@Param("id") id: string) {
    return this.creatives.publish(id);
  }
}
