import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { ShareService } from "./share.service";
import { ShareController } from "./share.controller";
import { ReachService } from "./reach.service";
import { RedirectController } from "./redirect.controller";

@Module({
  imports: [SecurityModule, ScoringModule],
  providers: [ShareService, ReachService],
  controllers: [ShareController, RedirectController],
  exports: [ShareService, ReachService],
})
export class ShareModule {}
