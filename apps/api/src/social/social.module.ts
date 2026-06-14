import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { SocialService } from "./social.service";
import { SocialController, SocialOAuthController } from "./social.controller";

@Module({
  imports: [SecurityModule, ScoringModule],
  providers: [SocialService],
  controllers: [SocialController, SocialOAuthController],
  exports: [SocialService],
})
export class SocialModule {}
