import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@pw/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InvitesService } from "./invites.service";

const createInviteSchema = z.object({
  orgUnitId: z.string().min(1),
  role: Role,
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
});

type CreateInviteDto = z.infer<typeof createInviteSchema>;
type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

/** Authenticated leaders/admins mint invite links for their teams. */
@ApiTags("invites")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("invites")
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /** Create a shareable invite link scoped to an org unit + role. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInviteSchema)) dto: CreateInviteDto,
  ) {
    return this.invites.create(user, dto.orgUnitId, dto.role);
  }
}

/**
 * Public self-registration via invite link (no JWT — the recruit arrives from a
 * shared link before they have an account). Mirrors SocialOAuthController: a
 * second @Controller in the same module that simply omits the JwtAuthGuard.
 */
@ApiTags("invites")
@Controller("invites")
export class InvitesPublicController {
  constructor(private readonly invites: InvitesService) {}

  /** Inspect an invite link's validity (for the public join page). */
  @Get(":token")
  status(@Param("token") token: string) {
    return this.invites.status(token);
  }

  /** Accept an invite and create the recruit's account. */
  @Post(":token/accept")
  accept(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(acceptInviteSchema)) dto: AcceptInviteDto,
  ) {
    return this.invites.accept(token, dto.name, dto.phone);
  }
}
