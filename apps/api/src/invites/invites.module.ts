import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { ScoringModule } from "../scoring/scoring.module";
import { InvitesService } from "./invites.service";
import { InvitesController, InvitesPublicController } from "./invites.controller";

@Module({
  imports: [SecurityModule, OrgModule, ScoringModule],
  providers: [InvitesService],
  controllers: [InvitesController, InvitesPublicController],
  exports: [InvitesService],
})
export class InvitesModule {}
