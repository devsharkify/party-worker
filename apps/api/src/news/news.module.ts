import { Module } from "@nestjs/common";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [NewsController],
  providers: [NewsService],
})
export class NewsModule {}
