import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { TeamStatsService } from "./teamstats.service";
import { TeamStatsController } from "./teamstats.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [TeamStatsService],
  controllers: [TeamStatsController],
  exports: [TeamStatsService],
})
export class TeamStatsModule {}
