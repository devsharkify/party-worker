import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { PushModule } from "../push/push.module";
import { CreativesService } from "./creatives.service";
import { CreativesController } from "./creatives.controller";
import { TemplatesService } from "./templates.service";
import { TemplatesController } from "./templates.controller";

@Module({
  imports: [SecurityModule, OrgModule, PushModule],
  providers: [CreativesService, TemplatesService],
  controllers: [CreativesController, TemplatesController],
  exports: [CreativesService, TemplatesService],
})
export class CreativesModule {}
