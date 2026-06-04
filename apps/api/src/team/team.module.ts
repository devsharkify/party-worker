import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { ScoringModule } from "../scoring/scoring.module";
import { TeamService } from "./team.service";
import { TeamController } from "./team.controller";

@Module({
  imports: [SecurityModule, OrgModule, ScoringModule],
  providers: [TeamService],
  controllers: [TeamController],
  exports: [TeamService],
})
export class TeamModule {}
