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
  ],
  controllers: [AppController],
})
export class AppModule {}
