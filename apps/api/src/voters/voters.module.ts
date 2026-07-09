import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { ScoringModule } from "../scoring/scoring.module";
import { VotersService } from "./voters.service";
import { VotersController } from "./voters.controller";

@Module({
  imports: [SecurityModule, OrgModule, ScoringModule],
  providers: [VotersService],
  controllers: [VotersController],
  exports: [VotersService],
})
export class VotersModule {}
