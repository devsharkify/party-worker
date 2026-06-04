import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "./prisma/prisma.service";

@ApiTags("health")
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  async health() {
    const users = await this.prisma.user.count();
    return { ok: true, users, ts: new Date().toISOString() };
  }
}
