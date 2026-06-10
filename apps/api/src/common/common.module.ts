import { Global, Module } from "@nestjs/common";
import { RedisRateLimitStore } from "./redis-ratelimit.store";

/**
 * Shared cross-cutting providers. Global so guards/services anywhere can inject
 * them without re-importing (e.g. RateLimitGuard needs RedisRateLimitStore).
 */
@Global()
@Module({
  providers: [RedisRateLimitStore],
  exports: [RedisRateLimitStore],
})
export class CommonModule {}
