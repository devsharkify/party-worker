import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { APP_ENV, type Env } from "../config/env";

/**
 * Shared sliding-window rate-limit store backed by Redis, so limits hold
 * across every API replica (the old in-memory Map reset per-process, letting
 * an attacker spread requests across instances to bypass it).
 *
 * Uses a Redis sorted set per key: members are request timestamps (ms), scored
 * by the same timestamp. Each check, in one pipeline:
 *   1. ZREMRANGEBYSCORE  — drop timestamps older than the window
 *   2. ZADD              — record this request
 *   3. ZCARD             — count requests now in the window
 *   4. PEXPIRE           — let the key self-clean after the window
 * If ZCARD exceeds the limit the request is rejected.
 *
 * If Redis is unreachable the store fails OPEN to a per-process in-memory
 * window — availability over strictness for a non-critical guard, with a
 * logged warning so the degradation is visible.
 */
@Injectable()
export class RedisRateLimitStore implements OnModuleDestroy {
  private readonly log = new Logger("RateLimit");
  private readonly redis: Redis | null;
  private redisHealthy = true;
  /** Fallback: key -> request timestamps (ms). */
  private readonly mem = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(@Inject(APP_ENV) env: Env) {
    let client: Redis | null = null;
    try {
      client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });
      client.on("error", (e) => {
        if (this.redisHealthy) {
          this.redisHealthy = false;
          this.log.warn(`Redis unavailable, rate-limit falling back to in-memory: ${e.message}`);
        }
      });
      client.on("ready", () => {
        if (!this.redisHealthy) this.log.log("Redis reconnected; rate-limit back to shared store");
        this.redisHealthy = true;
      });
    } catch (e) {
      this.log.warn(`Redis init failed, using in-memory rate-limit: ${(e as Error).message}`);
    }
    this.redis = client;
  }

  /**
   * Record a hit and return how many requests fall inside the window.
   * @returns count of requests in the current window (including this one)
   */
  async hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    if (this.redis && this.redisHealthy) {
      try {
        const member = `${now}-${Math.floor(now * 1000) % 1000}`;
        const results = await this.redis
          .multi()
          .zremrangebyscore(key, 0, now - windowMs)
          .zadd(key, now, member)
          .zcard(key)
          .pexpire(key, windowMs)
          .exec();
        // results[2] = [err, count] from ZCARD
        const count = results?.[2]?.[1];
        if (typeof count === "number") return count;
      } catch (e) {
        if (this.redisHealthy) {
          this.redisHealthy = false;
          this.log.warn(`Redis op failed, rate-limit falling back to in-memory: ${(e as Error).message}`);
        }
      }
    }
    return this.memHit(key, windowMs, now);
  }

  /** Earliest in-window timestamp for a key, for Retry-After (best effort). */
  async oldest(key: string, windowMs: number): Promise<number | null> {
    const now = Date.now();
    if (this.redis && this.redisHealthy) {
      try {
        const res = await this.redis.zrange(key, 0, 0, "WITHSCORES");
        if (res && res.length >= 2) return Number(res[1]);
        return null;
      } catch {
        /* fall through to memory */
      }
    }
    const ts = (this.mem.get(key) ?? []).filter((t) => t > now - windowMs);
    return ts.length ? ts[0] : null;
  }

  private memHit(key: string, windowMs: number, now: number): number {
    this.maybeSweep(now, windowMs);
    const windowStart = now - windowMs;
    const ts = (this.mem.get(key) ?? []).filter((t) => t > windowStart);
    ts.push(now);
    this.mem.set(key, ts);
    return ts.length;
  }

  // ── Distributed lock (used by social connect flows) ──────────────────────

  /** SET key value EX ttl NX — returns true if lock was acquired. */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.redis && this.redisHealthy) {
      try {
        const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
        return result === "OK";
      } catch (e) {
        this.log.warn(`Lock acquire failed (${key}): ${(e as Error).message}`);
      }
    }
    // no Redis → allow (non-blocking degradation)
    return true;
  }

  /** DEL key — releases the lock immediately. */
  async releaseLock(key: string): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.del(key);
      } catch (e) {
        this.log.warn(`Lock release failed (${key}): ${(e as Error).message}`);
      }
    }
  }

  /** TTL in seconds for a lock key (for Retry-After header). */
  async lockTtl(key: string): Promise<number> {
    if (this.redis && this.redisHealthy) {
      try {
        return await this.redis.ttl(key);
      } catch {
        /* best-effort */
      }
    }
    return 120;
  }

  private maybeSweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cutoff = now - windowMs;
    for (const [key, ts] of this.mem) {
      const live = ts.filter((t) => t > cutoff);
      if (live.length === 0) this.mem.delete(key);
      else this.mem.set(key, live);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }
}
