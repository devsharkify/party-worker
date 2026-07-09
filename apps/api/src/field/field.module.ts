import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { OrgModule } from "../org/org.module";
import { FieldService } from "./field.service";
import { FieldController } from "./field.controller";

@Module({
  imports: [SecurityModule, OrgModule],
  providers: [FieldService],
  controllers: [FieldController],
})
export class FieldModule {}
