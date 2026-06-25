import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { PushModule } from "../push/push.module";
import { CanvassRoutesController } from "./canvass-routes.controller";
import { CanvassRoutesService } from "./canvass-routes.service";

@Module({
  imports: [PrismaModule, SecurityModule, PushModule],
  controllers: [CanvassRoutesController],
  providers: [CanvassRoutesService],
  exports: [CanvassRoutesService],
})
export class CanvassRoutesModule {}
