import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { NewsService } from "./news.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller()
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @UseGuards(JwtAuthGuard)
  @Get("news")
  list(@Query("limit") limit?: string) {
    return this.news.list(limit ? parseInt(limit, 10) : 30);
  }
}
