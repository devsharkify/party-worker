import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { ScoringService } from "./scoring.service";
import { ScoringController } from "./scoring.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [ScoringService],
  controllers: [ScoringController],
  exports: [ScoringService],
})
export class ScoringModule {}
