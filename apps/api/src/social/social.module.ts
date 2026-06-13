import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { SocialService } from "./social.service";
import { PostizService } from "./postiz.service";
import { SocialController, SocialOAuthController, PostizOAuthController } from "./social.controller";

@Module({
  imports: [SecurityModule, ScoringModule],
  providers: [SocialService, PostizService],
  controllers: [SocialController, SocialOAuthController, PostizOAuthController],
  exports: [SocialService, PostizService],
})
export class SocialModule {}
