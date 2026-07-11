import { Controller, Get, Inject, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { NewsService } from "./news.service";
import { APP_ENV, type Env } from "../config/env";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Public, unauthenticated news card — the myTRS-owned page WhatsApp/Instagram
 * link previews resolve to instead of the raw external sourceUrl. No JWT
 * guard: crawlers and readers alike hit this with no access token.
 */
@ApiTags("news")
@Controller("news")
export class NewsPublicController {
  constructor(
    private readonly news: NewsService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  @Get(":id/public")
  async publicData(@Param("id") id: string) {
    const item = await this.news.findPublished(id);
    if (!item) throw new NotFoundException("News item not found");
    return {
      id: item.id,
      handle: item.handle,
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
    };
  }

  @Get(":id/card")
  async card(@Param("id") id: string, @Res() reply: FastifyReply): Promise<void> {
    const item = await this.news.findPublished(id);
    if (!item) {
      reply.code(404).header("content-type", "text/html; charset=utf-8").send("<h1>Not found</h1>");
      return;
    }

    const pageUrl = `${this.env.API_BASE_URL}/news/${item.id}/card`;
    const title = escapeHtml(item.title);
    const summary = escapeHtml(
      item.body.length > 200 ? `${item.body.slice(0, 200).trimEnd()}…` : item.body,
    );
    const image = item.imageUrl ? escapeHtml(item.imageUrl) : "";

    reply
      .header("content-type", "text/html; charset=utf-8")
      .send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — myTRS</title>
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${summary}">
<meta property="og:url" content="${pageUrl}">
${image ? `<meta property="og:image" content="${image}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${summary}">
${image ? `<meta name="twitter:image" content="${image}">` : ""}
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #0d0d1a; color: #fff; }
  img { width: 100%; border-radius: 12px; margin-bottom: 16px; }
  h1 { font-size: 22px; line-height: 1.3; }
  p { color: #94a3b8; line-height: 1.6; }
  .src { display: inline-block; margin-top: 16px; color: #f97316; text-decoration: none; }
</style>
</head>
<body>
${image ? `<img src="${image}" alt="">` : ""}
<h1>${title}</h1>
<p>${summary}</p>
${item.sourceUrl ? `<a class="src" href="${escapeHtml(item.sourceUrl)}">Read original source →</a>` : ""}
</body>
</html>`);
  }
}
