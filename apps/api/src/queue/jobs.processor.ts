import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { SchedulingService } from "../scheduling/scheduling.service";
import { ScoringService } from "../scoring/scoring.service";
import { RecruitsService } from "../recruits/recruits.service";

/** Logical name of the single shared queue all background jobs run on. */
export const JOBS_QUEUE = "jobs";

/** Job names handled by the worker. Used by both the processor and registrar. */
export const JOB_NAMES = {
  /** Auto-publish every creative whose scheduledAt is due (every 60s). */
  scheduledPublish: "scheduled-publish",
  /** Apply inactivity reputation decay (every 6h). */
  decay: "decay",
  /** Zero the weekly league every Monday 00:00 IST (was a manual admin button). */
  weeklyReset: "weekly-reset",
  /** Pay the delayed second-half recruit bonus daily (idempotent in service). */
  recruitBonus: "recruit-bonus",
} as const;

/**
 * Single BullMQ worker for the "jobs" queue. It is the dedicated consumer that
 * replaces the old in-process setInterval timers: BullMQ guarantees one active
 * run of each repeatable job across the whole deployment, so the work no longer
 * fans out per instance and survives restarts.
 *
 * `process` dispatches purely on job.name and delegates to the real business
 * logic on SchedulingService / ScoringService. Per-job errors are rethrown so
 * BullMQ records the failure (and can retry); the underlying services already
 * swallow per-item errors internally.
 */
@Processor(JOBS_QUEUE)
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly scheduling: SchedulingService,
    private readonly scoring: ScoringService,
    private readonly recruits: RecruitsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_NAMES.scheduledPublish: {
        const { published } = await this.scheduling.publishDue();
        if (published > 0) {
          this.logger.log(`scheduled-publish: published ${published} creative(s)`);
        }
        return { published };
      }
      case JOB_NAMES.decay: {
        const { affected } = await this.scoring.applyDecayForInactive();
        if (affected > 0) {
          this.logger.log(`decay: adjusted ${affected} user(s)`);
        }
        return { affected };
      }
      case JOB_NAMES.weeklyReset: {
        const { affected, promoted, demoted } = await this.scoring.runWeeklyRollover();
        this.logger.log(
          `weekly-reset: ${promoted} promoted, ${demoted} demoted, zeroed ${affected} user(s)`,
        );
        return { affected, promoted, demoted };
      }
      case JOB_NAMES.recruitBonus: {
        const result = await this.recruits.processBonus();
        this.logger.log(`recruit-bonus: ${JSON.stringify(result)}`);
        return result;
      }
      default:
        this.logger.warn(`Ignoring unknown job "${job.name}" (id=${job.id})`);
        return undefined;
    }
  }
}
