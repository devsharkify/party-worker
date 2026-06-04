import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";

/**
 * Provides JWT verification + the access-token and role guards, with no
 * dependency on AuthModule/UsersModule. Feature modules import this for route
 * protection, which keeps Auth <-> Users free of cycles.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class SecurityModule {}
