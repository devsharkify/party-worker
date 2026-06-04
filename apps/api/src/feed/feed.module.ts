import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { FeedService } from "./feed.service";
import { FeedController } from "./feed.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [FeedService],
  controllers: [FeedController],
  exports: [FeedService],
})
export class FeedModule {}
