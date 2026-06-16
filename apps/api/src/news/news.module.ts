import { Module } from "@nestjs/common";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { NewsScraperService } from "./news-scraper.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SecurityModule } from "../auth/security.module";
import { PushModule } from "../push/push.module";
import { ScoringModule } from "../scoring/scoring.module";

@Module({
  imports: [PrismaModule, SecurityModule, PushModule, ScoringModule],
  controllers: [NewsController],
  providers: [NewsService, NewsScraperService],
  exports: [NewsService, NewsScraperService],
})
export class NewsModule {}
