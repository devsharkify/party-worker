import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export interface RateLimitOptions {
  /** max requests allowed inside the window */
  limit: number;
  /** sliding-window length in milliseconds */
  windowMs: number;
}

export const RATE_LIMIT_KEY = "rate_limit";

/**
 * Per-route sliding-window limit. Attach with @RateLimit({ limit, windowMs })
 * and add RateLimitGuard to the route's @UseGuards. Defaults to 8 / 10 min.
 */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

const DEFAULTS: RateLimitOptions = { limit: 8, windowMs: 10 * 60_000 };

/**
 * A small in-memory, per-IP sliding-window limiter. Targeted (not global) so it
 * only throttles the routes it guards — normal app browsing is untouched.
 *
 * Note: process-local. A multi-instance prod deployment would back this with
 * Redis; for this single-process API it is sufficient and dependency-free.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** key = `${routeKey}:${ip}` -> recent request timestamps (ms) */
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? DEFAULTS;

    const req = ctx.switchToHttp().getRequest();
    const ip: string = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    // Scope the bucket per-route so distinct limited routes don't share a budget.
    const routeKey = `${ctx.getClass().name}.${ctx.getHandler().name}`;
    const key = `${routeKey}:${ip}`;

    const now = Date.now();
    this.maybeSweep(now);

    const windowStart = now - opts.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= opts.limit) {
      const retryAfterMs = timestamps[0] + opts.windowMs - now;
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many requests. Please wait a moment and try again.",
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  /** Periodically drop empty/expired buckets so the map can't grow unbounded. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cutoff = now - DEFAULTS.windowMs;
    for (const [key, ts] of this.hits) {
      const live = ts.filter((t) => t > cutoff);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }
}
