import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ActivityService } from "./activity.service";
import { ActivityController } from "./activity.controller";

@Module({
  imports: [SecurityModule],
  providers: [ActivityService],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
