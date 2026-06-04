import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";
import { ScoringService } from "../scoring/scoring.service";

/** How often the in-process decay pass runs. Daily is plenty for weekly decay. */
const DECAY_INTERVAL_MS = 24 * 3600_000;

/**
 * Lightweight background scheduler. @nestjs/schedule is not installed, so this
 * hand-rolls a guarded setInterval. In production this work would move to a real
 * scheduler/cron (e.g. a dedicated worker) so it survives restarts and doesn't
 * run per-instance; here a single in-process timer is sufficient.
 *
 * Disabled when NODE_ENV==='test' so the test runner isn't perturbed.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly scoring: ScoringService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === "test") return;
    // unref() so the timer never keeps the process alive on shutdown.
    this.timer = setInterval(() => void this.runDecay(), DECAY_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Run the decay pass, swallowing any error so the interval can never crash. */
  private async runDecay(): Promise<void> {
    try {
      const { affected } = await this.scoring.applyDecayForInactive();
      if (affected > 0) this.logger.log(`Inactivity decay applied to ${affected} user(s)`);
    } catch (err) {
      this.logger.error("Inactivity decay pass failed", err as Error);
    }
  }
}
