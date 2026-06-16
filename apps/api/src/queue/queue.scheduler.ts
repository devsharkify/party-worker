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
  // News scraper — pull RSS from Telugu/national channels every 30 minutes.
  { id: "news-scrape", name: JOB_NAMES.newsScrape, repeat: { every: 30 * 60_000 } },
  // Issue aging poster — create news items for stale open civic issues daily at 02:30 IST.
  { id: "issue-aging", name: JOB_NAMES.issueAging, repeat: { pattern: "30 2 * * *", tz: "Asia/Kolkata" } },
  // Calendar push — send today's festival/birthday/anniversary events at 06:00 IST.
  { id: "calendar-push", name: JOB_NAMES.calendarPush, repeat: { pattern: "0 6 * * *", tz: "Asia/Kolkata" } },
  // Worker of the Week — crown top scorer per unit Sunday 23:30 IST (before Monday reset).
  { id: "worker-of-week", name: JOB_NAMES.workerOfWeek, repeat: { pattern: "30 23 * * 0", tz: "Asia/Kolkata" } },
  // Verified Worker badge — daily sweep at 03:00 IST.
  { id: "worker-verify", name: JOB_NAMES.workerVerify, repeat: { pattern: "0 3 * * *", tz: "Asia/Kolkata" } },
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
