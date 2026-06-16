import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { JOB_NAMES, JOBS_QUEUE } from "./jobs.processor";

/** Repeatable schedules registered on boot: interval (every) or cron (pattern). */
type Repeat = { every: number } | { pattern: string; tz: string };
const SCHEDULES: ReadonlyArray<{ id: string; name: string; repeat: Repeat }> = [
  // Scan for due scheduled creatives and publish them.
  { id: "scheduled-publish", name: JOB_NAMES.scheduledPublish, repeat: { every: 60_000 } },
  // Apply inactivity reputation decay. Every 6h is plenty for weekly decay.
  { id: "decay", name: JOB_NAMES.decay, repeat: { every: 6 * 3600_000 } },
  // League week rollover — Monday 00:00 IST (idempotent: re-zeroing is a no-op).
  { id: "weekly-reset", name: JOB_NAMES.weeklyReset, repeat: { pattern: "0 0 * * 1", tz: "Asia/Kolkata" } },
  // Delayed second-half recruit bonus — daily 02:00 IST (service dedupes payouts).
  { id: "recruit-bonus", name: JOB_NAMES.recruitBonus, repeat: { pattern: "0 2 * * *", tz: "Asia/Kolkata" } },
  // Morning Brief — push latest published news headline at 7:30 AM IST.
  { id: "morning-brief", name: JOB_NAMES.morningBrief, repeat: { pattern: "30 7 * * *", tz: "Asia/Kolkata" } },
];

/**
 * Installs the repeatable BullMQ "job schedulers" exactly once on application
 * boot. Registration is idempotent: bullmq v5's upsertJobScheduler keys each
 * schedule by a stable id, so booting N instances (or restarting) converges on
 * a single schedule per job rather than piling up duplicates.
 *
 * Hardening:
 *  - When NODE_ENV==='test' we skip registration entirely so the test runner
 *    (and CI) never need a live Redis and never hang waiting on one.
 *  - All registration is wrapped in try/catch + Logger so a Redis outage at
 *    boot is logged and tolerated rather than crashing application startup.
 */
@Injectable()
export class QueueScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueueScheduler.name);

  constructor(@InjectQueue(JOBS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      this.logger.log("Test mode: skipping BullMQ scheduler registration");
      return;
    }
    try {
      await this.registerSchedules();
      this.logger.log(
        `Registered ${SCHEDULES.length} repeatable job scheduler(s) on "${JOBS_QUEUE}"`,
      );
    } catch (err) {
      // Most likely Redis is unreachable. Tolerate it: the API still boots and
      // serves HTTP; schedulers can be (re)registered on the next restart once
      // Redis is back.
      this.logger.error(
        `Failed to register BullMQ schedulers (is Redis up?): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async registerSchedules(): Promise<void> {
    const queue = this.queue as Queue & {
      upsertJobScheduler?: (
        id: string,
        repeat: Repeat,
        template?: { name?: string },
      ) => Promise<unknown>;
    };

    for (const { id, name, repeat } of SCHEDULES) {
      if (typeof queue.upsertJobScheduler === "function") {
        // Preferred bullmq v5 API: keyed, self-deduplicating scheduler.
        await queue.upsertJobScheduler(id, repeat, { name });
      } else {
        // Fallback for older bullmq: a repeat job. removeOnComplete keeps Redis
        // tidy; bullmq dedupes repeat jobs by their repeat key.
        await this.queue.add(name, {}, { repeat, removeOnComplete: true });
      }
    }
  }
}
