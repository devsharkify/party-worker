import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { OppositionController } from "./opposition.controller";
import { OppositionService } from "./opposition.service";

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [OppositionController],
  providers: [OppositionService],
})
export class OppositionModule {}
