import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgService } from "./org.service";
import { OrgController } from "./org.controller";

@Module({
  imports: [SecurityModule],
  providers: [OrgService],
  controllers: [OrgController],
  exports: [OrgService],
})
export class OrgModule {}
