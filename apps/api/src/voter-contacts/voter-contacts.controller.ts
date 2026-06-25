import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { VoterContactsService, CreateVoterContactDto } from "./voter-contacts.service";

@Controller("voter-contacts")
@UseGuards(JwtAuthGuard)
export class VoterContactsController {
  constructor(private readonly service: VoterContactsService) {}

  @Post()
  create(@Body() body: CreateVoterContactDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user.id);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user.id);
  }

  @Get("booth/:boothId/stats")
  boothStats(@Param("boothId") boothId: string) {
    return this.service.boothStats(boothId);
  }
}
