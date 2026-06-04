import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ConsentService } from "./consent.service";
import { ConsentController } from "./consent.controller";

@Module({
  imports: [SecurityModule],
  providers: [ConsentService],
  controllers: [ConsentController],
  exports: [ConsentService],
})
export class ConsentModule {}
