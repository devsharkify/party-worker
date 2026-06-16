import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoringModule } from "../scoring/scoring.module";
import { PushModule } from "../push/push.module";
import { SecurityModule } from "../auth/security.module";
import { BoothTasksController } from "./boothtasks.controller";
import { BoothTasksService } from "./boothtasks.service";

@Module({
  imports: [PrismaModule, ScoringModule, PushModule, SecurityModule],
  controllers: [BoothTasksController],
  providers: [BoothTasksService],
  exports: [BoothTasksService],
})
export class BoothTasksModule {}
