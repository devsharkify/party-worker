import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";
import { ScoringModule } from "../scoring/scoring.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { RecruitsModule } from "../recruits/recruits.module";
import { NewsModule } from "../news/news.module";
import { JOBS_QUEUE, JobsProcessor } from "./jobs.processor";
import { QueueScheduler } from "./queue.scheduler";

/**
 * Real Redis-backed background jobs via BullMQ, replacing the old in-process
 * setInterval timers in SchedulingService / MaintenanceService.
 *
 * Wiring:
 *  - forRootAsync builds the shared Redis connection from APP_ENV (REDIS_URL).
 *  - A single queue named "jobs" carries every background job; JobsProcessor is
 *    the lone WorkerHost consuming it, dispatching on job.name.
 *  - QueueScheduler installs the repeatable schedulers on boot (idempotent,
 *    skipped under NODE_ENV==='test', Redis outages tolerated).
 *
 * @Global so the injected queue / processor are available app-wide without each
 * feature module having to re-import BullModule.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL },
      }),
    }),
    BullModule.registerQueue({ name: JOBS_QUEUE }),
    SchedulingModule,
    ScoringModule,
    RecruitsModule,
    NewsModule,
  ],
  providers: [JobsProcessor, QueueScheduler],
  exports: [BullModule],
})
export class QueueModule {}
