import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { ComplianceService } from "../src/compliance/compliance.service";

/**
 * ComplianceService.checkPublish / assertPublishable.
 * The service reads MCMC_MODE + AI_LABEL_MIN_AREA_PCT off the injected APP_ENV,
 * so we construct it directly with a fake env object cast `as any`.
 */
const make = (mcmc: "on" | "off", minAreaPct = 10) =>
  new ComplianceService({ MCMC_MODE: mcmc, AI_LABEL_MIN_AREA_PCT: minAreaPct } as any);

const certifiedLabeled = { mcmcCertified: true, aiLabeled: true };
const uncertifiedLabeled = { mcmcCertified: false, aiLabeled: true };
const certifiedUnlabeled = { mcmcCertified: true, aiLabeled: false };

describe("ComplianceService — env-derived getters", () => {
  it("mcmcMode is true when MCMC_MODE='on'", () => {
    expect(make("on").mcmcMode).toBe(true);
  });
  it("mcmcMode is false when MCMC_MODE='off'", () => {
    expect(make("off").mcmcMode).toBe(false);
  });
  it("aiLabelMinAreaPct reflects the configured percentage", () => {
    expect(make("on", 25).aiLabelMinAreaPct).toBe(25);
  });
});

describe("ComplianceService.checkPublish — MCMC mode ON", () => {
  const svc = make("on");

  it("BLOCKS an uncertified creative even when AI-labeled", () => {
    const res = svc.checkPublish(uncertifiedLabeled);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/MCMC pre-certification is required/i);
  });

  it("ALLOWS a certified + AI-labeled creative", () => {
    const res = svc.checkPublish(certifiedLabeled);
    expect(res.allowed).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("BLOCKS when aiLabeled is false (and is certified)", () => {
    const res = svc.checkPublish(certifiedUnlabeled);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/AI-content label/i);
  });

  it("MCMC certification is checked BEFORE the AI label (uncertified+unlabeled => MCMC reason)", () => {
    const res = svc.checkPublish({ mcmcCertified: false, aiLabeled: false });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/MCMC pre-certification is required/i);
  });

  it("surfaces the configured min-area percentage in the AI-label reason", () => {
    const res = make("on", 18).checkPublish(certifiedUnlabeled);
    expect(res.reason).toContain("18%");
  });
});

describe("ComplianceService.checkPublish — MCMC mode OFF", () => {
  const svc = make("off");

  it("ALLOWS an uncertified creative as long as it is AI-labeled", () => {
    const res = svc.checkPublish(uncertifiedLabeled);
    expect(res.allowed).toBe(true);
  });

  it("still BLOCKS an unlabeled creative (AI label is non-bypassable)", () => {
    const res = svc.checkPublish({ mcmcCertified: false, aiLabeled: false });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/AI-content label/i);
  });
});

describe("ComplianceService.assertPublishable", () => {
  it("throws ForbiddenException when not allowed", () => {
    const svc = make("on");
    expect(() => svc.assertPublishable(uncertifiedLabeled)).toThrow(ForbiddenException);
  });

  it("does NOT throw when allowed", () => {
    const svc = make("on");
    expect(() => svc.assertPublishable(certifiedLabeled)).not.toThrow();
  });

  it("the thrown message matches the checkPublish reason", () => {
    const svc = make("on");
    const reason = svc.checkPublish(certifiedUnlabeled).reason;
    expect(() => svc.assertPublishable(certifiedUnlabeled)).toThrow(reason);
  });
});

describe("ComplianceService.labelSpec", () => {
  it("returns a non-removable label spec with the configured min area and ECI wordings", () => {
    const spec = make("on", 12).labelSpec();
    expect(spec.minAreaPct).toBe(12);
    expect(spec.removable).toBe(false);
    expect(spec.allowedText).toContain("AI-Generated");
  });
});
