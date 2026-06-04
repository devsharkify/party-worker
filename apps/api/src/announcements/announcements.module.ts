import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementsController } from "./announcements.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
