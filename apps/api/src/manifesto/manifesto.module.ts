import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { ManifestoService } from "./manifesto.service";
import { ManifestoController } from "./manifesto.controller";

@Module({
  imports: [PrismaModule, SecurityModule],
  providers: [ManifestoService],
  controllers: [ManifestoController],
  exports: [ManifestoService],
})
export class ManifestoModule {}
