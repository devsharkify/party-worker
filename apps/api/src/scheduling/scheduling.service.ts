import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreativesService } from "../creatives/creatives.service";

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
 * Content scheduling. Persists a future publish time on a Creative and exposes
 * `publishDue()`, which auto-publishes creatives once they're due by routing
 * each through CreativesService.publish (which enforces the MCMC compliance
 * gate). Uncertified creatives throw and are simply skipped.
 *
 * The periodic invocation of `publishDue()` is owned by the BullMQ queue
 * (see QueueModule): a repeatable "scheduled-publish" job fires every 60s on a
 * dedicated worker so the work survives restarts and doesn't fan out per
 * instance. This service is now pure business logic with no in-process timer.
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creatives: CreativesService,
  ) {}

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
   * is skipped and logged rather than aborting the whole pass. Returns the
   * count actually published so the caller (the BullMQ worker) can log/observe.
   *
   * Safe to call concurrently from at most one queue worker; BullMQ guarantees
   * a single active instance of the repeatable job.
   */
  async publishDue(): Promise<{ published: number }> {
    const due = await this.prisma.creative.findMany({
      where: { scheduledAt: { lte: new Date() }, published: false },
      select: { id: true },
    });
    let published = 0;
    for (const { id } of due) {
      try {
        await this.creatives.publish(id);
        published += 1;
        this.logger.log(`Auto-published scheduled creative ${id}`);
      } catch (err) {
        // Most likely the MCMC compliance gate rejecting an uncertified
        // creative. Skip it; a later run can retry once it's certified.
        this.logger.warn(
          `Skipped scheduled creative ${id}: ${(err as Error).message}`,
        );
      }
    }
    return { published };
  }
}
