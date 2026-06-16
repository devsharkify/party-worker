import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoringModule } from "../scoring/scoring.module";
import { SecurityModule } from "../auth/security.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [PrismaModule, ScoringModule, SecurityModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
