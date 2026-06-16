import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { WaGroupsController } from "./wagroups.controller";
import { WaGroupsService } from "./wagroups.service";

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [WaGroupsController],
  providers: [WaGroupsService],
  exports: [WaGroupsService],
})
export class WaGroupsModule {}
