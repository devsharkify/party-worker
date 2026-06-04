import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ReachService } from "./reach.service";

/**
 * Public tracked-link endpoint. Real humans are redirected to the content and
 * counted (deduped); link-preview crawlers get an OG page and are NOT counted
 * (so pasting a link into WhatsApp doesn't inflate reach).
 */
@ApiTags("redirect")
@Controller("r")
export class RedirectController {
  constructor(private readonly reach: ReachService) {}

  @Get(":linkId")
  async redirect(
    @Param("linkId") linkId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const dest = await this.reach.resolveDestination(linkId);
    if (!dest) {
      reply.code(404).send("Link not found");
      return;
    }

    const ua = String(req.headers["user-agent"] ?? "");
    if (this.reach.isCrawler(ua)) {
      reply
        .header("content-type", "text/html; charset=utf-8")
        .send(
          `<!doctype html><html><head><meta charset="utf-8">` +
            `<meta property="og:title" content="Party Worker"/>` +
            `<meta property="og:image" content="${dest}"/>` +
            `<meta http-equiv="refresh" content="0; url=${dest}"/>` +
            `</head><body></body></html>`,
        );
      return;
    }

    await this.reach.recordTap(linkId, req.ip, ua);
    reply.redirect(dest);
  }
}
