import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { PushService } from "./push.service";
import { PushController } from "./push.controller";

/**
 * Provides PushService for device-token management and push fanout.
 * ProvidersModule (global) supplies the PUSH_PROVIDER token.
 * PrismaModule (global) supplies PrismaService.
 * OrgModule supplies subtree resolution for org-unit-targeted pushes.
 */
@Module({
  imports: [SecurityModule, OrgModule],
  providers: [PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
