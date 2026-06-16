import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { NewsService } from "./news.service";
import { NewsScraperService } from "./news-scraper.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

const createNewsSchema = z.object({
  handle: z.string().default("admin"),
  title: z.string().min(1),
  body: z.string().min(1),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  status: z.enum(["draft", "published"]).default("published"),
});

type CreateNewsDto = z.infer<typeof createNewsSchema>;

@ApiTags("news")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly scraper: NewsScraperService,
  ) {}

  @Get("news")
  list(@Query("limit") limit?: string) {
    return this.news.list(limit ? parseInt(limit, 10) : 30);
  }

  @Get("news/all")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  listAll(@Query("limit") limit?: string) {
    return this.news.listAll(limit ? parseInt(limit, 10) : 50);
  }

  @Post("news")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  create(@Body(new ZodValidationPipe(createNewsSchema)) dto: CreateNewsDto) {
    return this.news.create(dto);
  }

  @Put("news/:id/publish")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  publish(@Param("id") id: string) {
    return this.news.publish(id);
  }

  @Delete("news/:id")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  remove(@Param("id") id: string) {
    return this.news.remove(id);
  }

  /** Mark a news item as 🔴 BREAKING — instantly pushes to all workers + pins at top. */
  @Put("news/:id/breaking")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  markBreaking(@Param("id") id: string) {
    return this.news.markBreaking(id);
  }

  /** Worker logs a news share (+5 pts, increments shareCount). */
  @Post("news/:id/share")
  logNewsShare(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.news.logShare(id, user.id);
  }

  /** Trigger an immediate RSS scrape — useful from the admin panel without waiting 30 min. */
  @Post("news/scrape")
  @UseGuards(RolesGuard)
  @Roles("hq_admin", "state_admin")
  scrape() {
    return this.scraper.scrape();
  }
}
