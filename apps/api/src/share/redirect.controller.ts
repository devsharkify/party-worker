import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ReachService } from "./reach.service";
import { APP_ENV, type Env } from "../config/env";

interface HitBody {
  ip?: string;
  ua?: string;
  ref?: string;
  ts?: string;
}

/**
 * Public tracked-link endpoint. Real humans are redirected to the content and
 * counted (deduped); link-preview crawlers get an OG page and are NOT counted
 * (so pasting a link into WhatsApp doesn't inflate reach).
 *
 * Two additional endpoints are called from the Cloudflare edge worker:
 *   POST /r/:trackedLinkId/hit  — record an impression (no auth, CF secret)
 *   GET  /r/:trackedLinkId/dest — resolve destination URL (no auth, CF secret)
 */
@ApiTags("redirect")
@Controller("r")
export class RedirectController {
  constructor(
    private readonly reach: ReachService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  private verifyCfSecret(req: FastifyRequest): void {
    const incoming = req.headers["x-cf-secret"] as string | undefined;
    if (incoming !== this.env.CF_WEBHOOK_SECRET) {
      throw new ForbiddenException("Invalid CF webhook secret");
    }
  }

  // ─── origin redirect (existing) ─────────────────────────────────────────────

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

  // ─── CF edge webhook: resolve destination only (no side-effects) ────────────

  /**
   * Called by the Cloudflare worker BEFORE redirecting the user.
   * Returns the destination URL so the worker can issue the 302 at the edge
   * without hitting the origin again.
   *
   * No auth guard — protected by the shared CF_WEBHOOK_SECRET header only.
   */
  @Get(":trackedLinkId/dest")
  async dest(
    @Param("trackedLinkId") trackedLinkId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ url: string }> {
    this.verifyCfSecret(req);
    const url = await this.reach.resolveDestination(trackedLinkId);
    if (!url) {
      // Return 404-like JSON; the CF worker will fall back to the origin.
      throw new ForbiddenException("Link not found");
    }
    return { url };
  }

  // ─── CF edge webhook: record impression ─────────────────────────────────────

  /**
   * Fire-and-forget hit from the Cloudflare worker.
   * Applies the same crawler-filter and dedup logic as the origin redirect
   * handler so there is no double-counting if both fire (the unique DB
   * constraint on dedupHash absorbs duplicates silently).
   *
   * No auth guard — protected by the shared CF_WEBHOOK_SECRET header only.
   */
  @Post(":trackedLinkId/hit")
  @HttpCode(204)
  async hit(
    @Param("trackedLinkId") trackedLinkId: string,
    @Body() body: HitBody,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    this.verifyCfSecret(req);

    const ip = body.ip ?? "";
    const ua = body.ua ?? "";

    // Crawlers are already filtered in the CF worker, but double-check here
    // for defence in depth.
    if (this.reach.isCrawler(ua)) return;

    await this.reach.recordTap(trackedLinkId, ip, ua);
  }
}
