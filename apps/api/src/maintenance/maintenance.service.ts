import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";
import { ScoringService } from "../scoring/scoring.service";

/**
 * Maintenance entrypoint for the inactivity-decay pass. The previous in-process
 * setInterval has been removed: the periodic schedule is now owned by the
 * BullMQ queue (see QueueModule), which runs a repeatable "decay" job every 6h
 * on a dedicated worker so the work survives restarts and doesn't run
 * per-instance. The actual decay computation lives on ScoringService; this
 * service simply wraps it with logging and error-swallowing so a single bad
 * run can never escalate.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly scoring: ScoringService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /** Run the decay pass, swallowing any error so a scheduled run can never crash. */
  async runDecay(): Promise<{ affected: number }> {
    try {
      const result = await this.scoring.applyDecayForInactive();
      if (result.affected > 0) {
        this.logger.log(`Inactivity decay applied to ${result.affected} user(s)`);
      }
      return result;
    } catch (err) {
      this.logger.error("Inactivity decay pass failed", err as Error);
      return { affected: 0 };
    }
  }
}
