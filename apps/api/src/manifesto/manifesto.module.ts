import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ManifestoService } from "./manifesto.service";
import { ManifestoController } from "./manifesto.controller";

@Module({
  imports: [SecurityModule],
  providers: [ManifestoService],
  controllers: [ManifestoController],
  exports: [ManifestoService],
})
export class ManifestoModule {}
