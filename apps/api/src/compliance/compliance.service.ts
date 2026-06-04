import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";

export interface PublishCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Encodes the non-bypassable compliance rules:
 *  - MCMC: while Model Code of Conduct mode is ON, only certified creatives publish.
 *  - AI label: every personalized/AI render must carry a non-removable label
 *    covering >= AI_LABEL_MIN_AREA_PCT of the visual area (2025 IT Rules amendment).
 */
@Injectable()
export class ComplianceService {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  get mcmcMode(): boolean {
    return this.env.MCMC_MODE === "on";
  }

  get aiLabelMinAreaPct(): number {
    return this.env.AI_LABEL_MIN_AREA_PCT;
  }

  checkPublish(creative: { mcmcCertified: boolean; aiLabeled: boolean }): PublishCheck {
    if (this.mcmcMode && !creative.mcmcCertified) {
      return {
        allowed: false,
        reason:
          "MCMC pre-certification is required while Model Code of Conduct mode is ON. Certify this creative before publishing.",
      };
    }
    if (!creative.aiLabeled) {
      return {
        allowed: false,
        reason: `An AI-content label covering at least ${this.aiLabelMinAreaPct}% of the visual area is mandatory.`,
      };
    }
    return { allowed: true };
  }

  assertPublishable(creative: { mcmcCertified: boolean; aiLabeled: boolean }): void {
    const result = this.checkPublish(creative);
    if (!result.allowed) throw new ForbiddenException(result.reason);
  }

  /** Spec the client uses to burn the label into renders. */
  labelSpec() {
    return {
      minAreaPct: this.aiLabelMinAreaPct,
      // ECI-accepted wordings; the localized text comes from the i18n catalog.
      allowedText: ["AI-Generated", "Digitally Enhanced", "Synthetic Content"],
      removable: false,
    };
  }
}
