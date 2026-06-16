import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PushModule } from "../push/push.module";
import { SecurityModule } from "../auth/security.module";
import { CrisisController } from "./crisis.controller";
import { CrisisService } from "./crisis.service";

@Module({
  imports: [PrismaModule, PushModule, SecurityModule],
  controllers: [CrisisController],
  providers: [CrisisService],
  exports: [CrisisService],
})
export class CrisisModule {}
