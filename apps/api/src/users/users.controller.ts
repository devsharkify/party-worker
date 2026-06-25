import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  updateProfileSchema,
  upsertWorkerProfileSchema,
  type UpdateProfileDto,
  type UpsertWorkerProfileDto,
} from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

const photoSchema = z.object({ dataUrl: z.string().min(16) });

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.users.toPublic(user.id);
  }

  @Patch("me")
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.id, dto);
  }

  @Post("me/photo")
  setPhoto(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(photoSchema)) dto: { dataUrl: string },
  ) {
    return this.users.setPhotoFromDataUrl(user.id, dto.dataUrl);
  }

  @Get("me/card")
  card(@CurrentUser() user: AuthUser) {
    return this.users.getMembershipCard(user.id);
  }

  @Get("me/profile")
  getProfile(@CurrentUser() user: AuthUser) {
    return this.users.getWorkerProfile(user.id);
  }

  @Patch("me/profile")
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(upsertWorkerProfileSchema)) dto: UpsertWorkerProfileDto,
  ) {
    return this.users.upsertWorkerProfile(user.id, dto);
  }
}
