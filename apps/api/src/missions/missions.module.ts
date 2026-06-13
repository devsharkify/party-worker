import { Module } from "@nestjs/common";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoringModule } from "../scoring/scoring.module";

@Module({
  imports: [PrismaModule, ScoringModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
