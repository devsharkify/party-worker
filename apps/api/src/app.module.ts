import { Module } from "@nestjs/common";
import { EnvModule } from "./config/env.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProvidersModule } from "./providers/providers.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrgModule } from "./org/org.module";
import { ScoringModule } from "./scoring/scoring.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { CreativesModule } from "./creatives/creatives.module";
import { FeedModule } from "./feed/feed.module";
import { ShareModule } from "./share/share.module";
import { SocialModule } from "./social/social.module";
import { PaymentsModule } from "./payments/payments.module";
import { EventsModule } from "./events/events.module";
import { GrievancesModule } from "./grievances/grievances.module";
import { AdminModule } from "./admin/admin.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { TeamModule } from "./team/team.module";
import { ActivityModule } from "./activity/activity.module";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { TeamStatsModule } from "./teamstats/teamstats.module";
import { RecruitsModule } from "./recruits/recruits.module";
import { InvitesModule } from "./invites/invites.module";
import { ContentAnalyticsModule } from "./contentanalytics/content-analytics.module";
import { ConsentModule } from "./consent/consent.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    ProvidersModule,
    ComplianceModule,
    AuthModule,
    UsersModule,
    OrgModule,
    ScoringModule,
    CreativesModule,
    FeedModule,
    ShareModule,
    SocialModule,
    PaymentsModule,
    EventsModule,
    GrievancesModule,
    AdminModule,
    MaintenanceModule,
    TeamModule,
    ActivityModule,
    AnnouncementsModule,
    TeamStatsModule,
    RecruitsModule,
    InvitesModule,
    ContentAnalyticsModule,
    ConsentModule,
    SchedulingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
