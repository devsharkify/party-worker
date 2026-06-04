import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { RateLimitGuard } from "./rate-limit.guard";

/**
 * Provides JWT verification + the access-token and role guards, with no
 * dependency on AuthModule/UsersModule. Feature modules import this for route
 * protection, which keeps Auth <-> Users free of cycles.
 *
 * RateLimitGuard is a singleton here so its in-memory window state is shared.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard, RolesGuard, RateLimitGuard],
  exports: [JwtAuthGuard, RolesGuard, RateLimitGuard, JwtModule],
})
export class SecurityModule {}
