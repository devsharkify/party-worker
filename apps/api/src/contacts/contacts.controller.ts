import { Controller, Get, Post, Body, UseGuards, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  register(
    @Body() body: { name: string; phone?: string; address?: string; notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.contacts.register(body, user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.contacts.list(user.id, limit ? parseInt(limit, 10) : 50);
  }

  @Get("unit-count")
  unitCount(@Query("orgUnitId") orgUnitId: string) {
    return this.contacts.unitCount(orgUnitId);
  }
}
