import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { CreativesModule } from "../creatives/creatives.module";
import { SchedulingService } from "./scheduling.service";
import {
  AdminSchedulingController,
  CreativeSchedulingController,
} from "./scheduling.controller";

@Module({
  imports: [SecurityModule, CreativesModule],
  providers: [SchedulingService],
  controllers: [CreativeSchedulingController, AdminSchedulingController],
  exports: [SchedulingService],
})
export class SchedulingModule {}
