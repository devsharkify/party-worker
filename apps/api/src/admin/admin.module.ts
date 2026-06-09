import { Module } from "@nestjs/common";
import { SecurityModule } from "../auth/security.module";
import { ScoringModule } from "../scoring/scoring.module";
import { PushModule } from "../push/push.module";
import { OrgModule } from "../org/org.module";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";

/**
 * HQ/state-admin dashboard + back-office actions: aggregate stats, the grievance
 * queue, and admin-triggered scoring maintenance. All routes are guarded by
 * JwtAuthGuard + RolesGuard('hq_admin','state_admin') at the controller level.
 */
@Module({
  imports: [SecurityModule, ScoringModule, PushModule, OrgModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
