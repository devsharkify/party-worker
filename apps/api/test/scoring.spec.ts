import { describe, expect, it } from "vitest";
import {
  applyDecay,
  computeSharePoints,
  nextTierProgress,
  SCORING,
  streakMultiplier,
  tierForReputation,
} from "@pw/shared";

describe("computeSharePoints — sharePoints = 2 + 0.1*reach, cap 30", () => {
  it("gives the base for zero reach", () => {
    expect(computeSharePoints(0)).toBe(2);
  });
  it("adds 0.1 per unique reach", () => {
    expect(computeSharePoints(25)).toBeCloseTo(4.5);
    expect(computeSharePoints(100)).toBeCloseTo(12);
  });
  it("caps at 30", () => {
    expect(computeSharePoints(1000)).toBe(SCORING.SHARE_CAP);
    expect(computeSharePoints(280)).toBe(30);
  });
  it("never goes below base for negative/garbage", () => {
    expect(computeSharePoints(-5)).toBe(2);
  });
});

describe("incremental reach award (what ReachService awards)", () => {
  // Server awards round(computeSharePoints(reach)) minus what's already been awarded.
  const target = (reach: number) => Math.round(computeSharePoints(reach));
  it("base 2 at share, then climbs with reach", () => {
    expect(target(0)).toBe(2);
    expect(target(25)).toBe(5); // round(4.5)
    expect(target(100)).toBe(12);
  });
  it("is monotonic and capped", () => {
    let prev = 0;
    for (let r = 0; r <= 500; r += 10) {
      const t = target(r);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(30);
      prev = t;
    }
  });
});

describe("tierForReputation", () => {
  it("maps reputation to the right tier", () => {
    expect(tierForReputation(0)).toBe("karyakarta");
    expect(tierForReputation(499)).toBe("karyakarta");
    expect(tierForReputation(500)).toBe("sevak");
    expect(tierForReputation(2000)).toBe("pramukh");
    expect(tierForReputation(5000)).toBe("nayak");
    expect(tierForReputation(15000)).toBe("ratna");
    expect(tierForReputation(999999)).toBe("ratna");
  });
});

describe("nextTierProgress", () => {
  it("reports remaining points to the next tier", () => {
    expect(nextTierProgress(0)).toEqual({ next: "sevak", remaining: 500 });
    expect(nextTierProgress(1800)).toEqual({ next: "pramukh", remaining: 200 });
  });
  it("returns null at the top tier", () => {
    expect(nextTierProgress(20000)).toEqual({ next: null, remaining: 0 });
  });
});

describe("streakMultiplier — capped at 1.5x", () => {
  it("starts at 1.0 and grows", () => {
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBeCloseTo(1.05);
  });
  it("never exceeds 1.5", () => {
    expect(streakMultiplier(100)).toBe(1.5);
  });
});

describe("applyDecay — -2%/inactive week on lifetime", () => {
  it("does nothing when active", () => {
    expect(applyDecay(1000, 0)).toBe(1000);
  });
  it("decays compounding per week", () => {
    expect(applyDecay(1000, 1)).toBe(980);
    expect(applyDecay(1000, 4)).toBe(Math.round(1000 * 0.98 ** 4));
  });
});
