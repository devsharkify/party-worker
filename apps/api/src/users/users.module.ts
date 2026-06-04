import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [SecurityModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
