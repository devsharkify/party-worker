import { Module } from "@nestjs/common";
import { ScoringModule } from "../scoring/scoring.module";
import { MaintenanceService } from "./maintenance.service";

/**
 * Hosts the background scoring-maintenance scheduler (inactivity decay). The
 * admin-triggered endpoints live in AdminModule; this module only runs the
 * periodic pass.
 */
@Module({
  imports: [ScoringModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
