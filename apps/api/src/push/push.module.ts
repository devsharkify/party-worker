import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { PushService } from "./push.service";
import { PushController } from "./push.controller";

/**
 * Provides PushService for device-token management and FCM fanout.
 * ProvidersModule (global) supplies the PUSH_PROVIDER token.
 * PrismaModule (global) supplies PrismaService.
 */
@Module({
  imports: [SecurityModule],
  providers: [PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
