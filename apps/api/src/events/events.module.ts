import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";

@Module({
  imports: [SecurityModule, ScoringModule],
  providers: [EventsService],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
