import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoringModule } from "../scoring/scoring.module";
import { SecurityModule } from "../auth/security.module";
import { PollsController } from "./polls.controller";
import { PollsService } from "./polls.service";

@Module({
  imports: [PrismaModule, ScoringModule, SecurityModule],
  controllers: [PollsController],
  providers: [PollsService],
  exports: [PollsService],
})
export class PollsModule {}
