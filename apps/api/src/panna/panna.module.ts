import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { PannaService } from "./panna.service";
import { PannaController } from "./panna.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [PannaService],
  controllers: [PannaController],
  exports: [PannaService],
})
export class PannaModule {}
