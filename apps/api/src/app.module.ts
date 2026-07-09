import { Module } from "@nestjs/common";
import { EnvModule } from "./config/env.module";
import { CommonModule } from "./common/common.module";
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
import { MissionsModule } from "./missions/missions.module";
import { NewsModule } from "./news/news.module";
import { TeamStatsModule } from "./teamstats/teamstats.module";
import { RecruitsModule } from "./recruits/recruits.module";
import { InvitesModule } from "./invites/invites.module";
import { ContentAnalyticsModule } from "./contentanalytics/content-analytics.module";
import { ConsentModule } from "./consent/consent.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { QueueModule } from "./queue/queue.module";
import { AiModule } from "./ai/ai.module";
import { PushModule } from "./push/push.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { PosterCalendarModule } from "./poster-calendar/poster-calendar.module";
import { PollsModule } from "./polls/polls.module";
import { ContactsModule } from "./contacts/contacts.module";
import { CrisisModule } from "./crisis/crisis.module";
import { OppositionModule } from "./opposition/opposition.module";
import { BoothTasksModule } from "./boothtasks/boothtasks.module";
import { CanvassRoutesModule } from "./canvass-routes/canvass-routes.module";
import { WaGroupsModule } from "./wagroups/wagroups.module";
import { VoterContactsModule } from "./voter-contacts/voter-contacts.module";
import { VotersModule } from "./voters/voters.module";
import { FieldModule } from "./field/field.module";
import { ManifestoModule } from "./manifesto/manifesto.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    EnvModule,
    CommonModule,
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
    MissionsModule,
    NewsModule,
    TeamStatsModule,
    RecruitsModule,
    InvitesModule,
    ContentAnalyticsModule,
    ConsentModule,
    SchedulingModule,
    QueueModule,
    AiModule,
    PushModule,
    AnalyticsModule,
    PosterCalendarModule,
    PollsModule,
    ContactsModule,
    CrisisModule,
    OppositionModule,
    BoothTasksModule,
    CanvassRoutesModule,
    WaGroupsModule,
    VoterContactsModule,
    VotersModule,
    FieldModule,
    ManifestoModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
