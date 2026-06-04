import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { RecruitsService } from "./recruits.service";
import { RecruitsController, RecruitsAdminController } from "./recruits.controller";

@Module({
  imports: [SecurityModule, ScoringModule],
  providers: [RecruitsService],
  controllers: [RecruitsController, RecruitsAdminController],
  exports: [RecruitsService],
})
export class RecruitsModule {}
