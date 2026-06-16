import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { PushModule } from "../push/push.module";
import { PosterCalendarService } from "./poster-calendar.service";
import { PosterCalendarController } from "./poster-calendar.controller";

@Module({
  imports: [SecurityModule, PushModule],
  providers: [PosterCalendarService],
  controllers: [PosterCalendarController],
  exports: [PosterCalendarService],
})
export class PosterCalendarModule {}
