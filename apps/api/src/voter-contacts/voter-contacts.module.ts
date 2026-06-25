import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { VoterContactsController } from "./voter-contacts.controller";
import { VoterContactsService } from "./voter-contacts.service";

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [VoterContactsController],
  providers: [VoterContactsService],
  exports: [VoterContactsService],
})
export class VoterContactsModule {}
