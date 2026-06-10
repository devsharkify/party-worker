import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RedisRateLimitStore } from "../common/redis-ratelimit.store";

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
 * Per-IP, per-route sliding-window limiter. Targeted (not global) so it only
 * throttles the routes it guards — normal app browsing is untouched.
 *
 * Backed by Redis (RedisRateLimitStore) so limits hold across all API replicas;
 * falls back to per-process memory only if Redis is down.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RedisRateLimitStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? DEFAULTS;

    const req = ctx.switchToHttp().getRequest();
    const ip: string = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    // Scope the bucket per-route so distinct limited routes don't share a budget.
    const routeKey = `${ctx.getClass().name}.${ctx.getHandler().name}`;
    const key = `rl:${routeKey}:${ip}`;

    const count = await this.store.hit(key, opts.windowMs);

    if (count > opts.limit) {
      const oldest = await this.store.oldest(key, opts.windowMs);
      const retryAfterMs = oldest ? oldest + opts.windowMs - Date.now() : opts.windowMs;
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many requests. Please wait a moment and try again.",
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
