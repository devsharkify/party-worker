import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreativesService } from "../creatives/creatives.service";

/** How often the in-process tick scans for due creatives. */
const TICK_INTERVAL_MS = 60_000;

/** Shape returned by the schedule/unschedule endpoints. */
export interface ScheduleResult {
  id: string;
  scheduledAt: Date | null;
}

/** A single row in the admin "scheduled, not yet published" listing. */
export interface ScheduledCreativeRow {
  id: string;
  title: string;
  scheduledAt: Date | null;
  mcmcCertified: boolean;
}

/**
 * Content scheduling. Persists a future publish time on a Creative and runs a
 * lightweight in-process tick that auto-publishes creatives once they're due,
 * routing each through CreativesService.publish (which enforces the MCMC
 * compliance gate). Uncertified creatives throw and are simply skipped.
 *
 * This hand-rolled setInterval is fine for a single instance. In production
 * this work would move to a real scheduler (BullMQ delayed jobs / cron on a
 * dedicated worker) so it survives restarts and doesn't fan out per-instance.
 *
 * The tick is disabled entirely when NODE_ENV==='test' so it never perturbs
 * the test runner.
 */
@Injectable()
export class SchedulingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulingService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly creatives: CreativesService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    // unref() so the timer never keeps the process alive on shutdown.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedule a creative to auto-publish at a future ISO instant. */
  async schedule(id: string, scheduledAtIso: string): Promise<ScheduleResult> {
    const when = new Date(scheduledAtIso);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException("scheduledAt is not a valid date");
    }
    if (when.getTime() <= Date.now()) {
      throw new BadRequestException("scheduledAt must be in the future");
    }
    const existing = await this.prisma.creative.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Creative not found");

    const updated = await this.prisma.creative.update({
      where: { id },
      data: { scheduledAt: when },
      select: { id: true, scheduledAt: true },
    });
    return updated;
  }

  /** Clear a creative's schedule so the tick will no longer pick it up. */
  async unschedule(id: string): Promise<ScheduleResult> {
    const existing = await this.prisma.creative.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Creative not found");

    const updated = await this.prisma.creative.update({
      where: { id },
      data: { scheduledAt: null },
      select: { id: true, scheduledAt: true },
    });
    return updated;
  }

  /** Creatives that are scheduled and not yet published, soonest first. */
  async listScheduled(): Promise<ScheduledCreativeRow[]> {
    return this.prisma.creative.findMany({
      where: { scheduledAt: { not: null }, published: false },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, title: true, scheduledAt: true, mcmcCertified: true },
    });
  }

  /**
   * One pass: publish every due, unpublished creative. Each publish is wrapped
   * in try/catch so an uncertified creative (which the compliance gate rejects)
   * is skipped and logged rather than aborting the whole pass. A guard flag
   * prevents overlapping ticks from running concurrently.
   */
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.prisma.creative.findMany({
        where: { scheduledAt: { lte: new Date() }, published: false },
        select: { id: true },
      });
      for (const { id } of due) {
        try {
          await this.creatives.publish(id);
          this.logger.log(`Auto-published scheduled creative ${id}`);
        } catch (err) {
          // Most likely the MCMC compliance gate rejecting an uncertified
          // creative. Skip it; a later tick can retry once it's certified.
          this.logger.warn(
            `Skipped scheduled creative ${id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error("Scheduling tick failed", err as Error);
    } finally {
      this.ticking = false;
    }
  }
}
