import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { SchedulingService } from "../scheduling/scheduling.service";
import { ScoringService } from "../scoring/scoring.service";
import { RecruitsService } from "../recruits/recruits.service";
import { NewsService } from "../news/news.service";
import { NewsScraperService } from "../news/news-scraper.service";
import { GrievancesService } from "../grievances/grievances.service";
import { PosterCalendarService } from "../poster-calendar/poster-calendar.service";

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
  /** Send the morning news headline push at 7:30 AM IST. */
  morningBrief: "morning-brief",
  /** Scrape RSS feeds from Telugu/national news channels every 30 minutes. */
  newsScrape: "news-scrape",
  /** Auto-poster for open civic issues older than 7 days — daily at 02:30 IST. */
  issueAging: "issue-aging",
  /** Push today's festival/birthday/anniversary calendar events — daily at 06:00 IST. */
  calendarPush: "calendar-push",
  /** Worker-of-the-Week: pick champions per unit, news item + personal push — Sunday 23:30 IST. */
  workerOfWeek: "worker-of-week",
  /** Verified Worker badge: daily sweep to grant/revoke verified status. */
  workerVerify: "worker-verify",
  /** Constituency failure report: post coverage alert news item — Sunday 23:00 IST. */
  constituencyFailure: "constituency-failure",
  /** Sentiment pulse: post daily news sentiment summary — daily 07:00 IST (after morning scrape). */
  sentimentPulse: "sentiment-pulse",
  /** Volunteer surge detector: celebrate booth-level registration spikes — daily 08:00 IST. */
  volunteerSurge: "volunteer-surge",
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
    private readonly news: NewsService,
    private readonly newsScraper: NewsScraperService,
    private readonly grievances: GrievancesService,
    private readonly calendar: PosterCalendarService,
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
      case JOB_NAMES.morningBrief: {
        const result = await this.news.sendMorningBrief();
        if (result.sent) {
          this.logger.log(`morning-brief: sent — "${result.title}"`);
        } else {
          this.logger.log("morning-brief: no published news to send");
        }
        return result;
      }
      case JOB_NAMES.newsScrape: {
        const result = await this.newsScraper.scrape();
        this.logger.log(
          `news-scrape: fetched=${result.fetched} saved=${result.saved} skipped=${result.skipped}`,
        );
        return result;
      }
      case JOB_NAMES.issueAging: {
        const result = await this.grievances.createAgingPosters();
        if (result.posted > 0) {
          this.logger.log(`issue-aging: posted ${result.posted}/${result.found} aging posters`);
        }
        return result;
      }
      case JOB_NAMES.calendarPush: {
        const result = await this.calendar.sendToday();
        if (result.sent > 0) {
          this.logger.log(`calendar-push: sent ${result.sent}/${result.found} calendar events`);
        }
        return result;
      }
      case JOB_NAMES.workerOfWeek: {
        const result = await this.scoring.pickWorkerOfWeek();
        this.logger.log(`worker-of-week: ${result.winners} champions crowned`);
        return result;
      }
      case JOB_NAMES.workerVerify: {
        const result = await this.scoring.runVerification();
        if (result.verified > 0 || result.unverified > 0) {
          this.logger.log(`worker-verify: +${result.verified} verified, -${result.unverified} unverified`);
        }
        return result;
      }
      case JOB_NAMES.constituencyFailure: {
        const result = await this.scoring.postConstituencyFailureReport();
        if (result.found > 0) {
          this.logger.log(`constituency-failure: ${result.found} failing constituencies, posted=${result.posted}`);
        }
        return result;
      }
      case JOB_NAMES.sentimentPulse: {
        const result = await this.scoring.postSentimentPulse();
        if (result.posted) this.logger.log("sentiment-pulse: daily pulse posted");
        return result;
      }
      case JOB_NAMES.volunteerSurge: {
        const result = await this.scoring.detectVolunteerSurge();
        if (result.surges > 0) this.logger.log(`volunteer-surge: ${result.surges} surge(s) detected`);
        return result;
      }
      default:
        this.logger.warn(`Ignoring unknown job "${job.name}" (id=${job.id})`);
        return undefined;
    }
  }
}
