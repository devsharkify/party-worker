import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { SecurityModule } from "./security.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

@Module({
  imports: [SecurityModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
