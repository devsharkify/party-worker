import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { OrgModule } from "../org/org.module";
import { GrievancesService } from "./grievances.service";
import { GrievancesController } from "./grievances.controller";

@Module({
  imports: [SecurityModule, ScoringModule, OrgModule],
  providers: [GrievancesService],
  controllers: [GrievancesController],
  exports: [GrievancesService],
})
export class GrievancesModule {}
