import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { BoothHealthService } from "./booth-health.service";
import { BoothHealthController } from "./booth-health.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [BoothHealthService],
  controllers: [BoothHealthController],
  exports: [BoothHealthService],
})
export class BoothHealthModule {}
