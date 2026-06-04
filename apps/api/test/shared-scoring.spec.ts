import { describe, expect, it } from "vitest";
import {
  applyDecay,
  computeSharePoints,
  nextTierProgress,
  POOL,
  SCORING,
  streakMultiplier,
  TIER_THRESHOLDS,
  tierForReputation,
} from "@pw/shared";

/**
 * Gap coverage for the pure @pw/shared scoring helpers. scoring.spec.ts already
 * covers the happy paths; this file targets boundaries, rounding, and constant
 * integrity that the suite did not yet assert.
 */

describe("tierForReputation — exact threshold boundaries", () => {
  it("returns the lower tier one point below each threshold", () => {
    expect(tierForReputation(499)).toBe("karyakarta");
    expect(tierForReputation(1999)).toBe("sevak");
    expect(tierForReputation(4999)).toBe("pramukh");
    expect(tierForReputation(14999)).toBe("nayak");
  });
  it("returns the higher tier exactly at each threshold (inclusive)", () => {
    expect(tierForReputation(500)).toBe("sevak");
    expect(tierForReputation(2000)).toBe("pramukh");
    expect(tierForReputation(5000)).toBe("nayak");
    expect(tierForReputation(15000)).toBe("ratna");
  });
  it("floors negative/garbage reputation to karyakarta", () => {
    expect(tierForReputation(-100)).toBe("karyakarta");
    expect(tierForReputation(Number.NaN as unknown as number)).toBe("karyakarta");
  });
});

describe("nextTierProgress — every rung", () => {
  it("reports the next tier + remaining at each level", () => {
    expect(nextTierProgress(0)).toEqual({ next: "sevak", remaining: 500 });
    expect(nextTierProgress(500)).toEqual({ next: "pramukh", remaining: 1500 });
    expect(nextTierProgress(2000)).toEqual({ next: "nayak", remaining: 3000 });
    expect(nextTierProgress(5000)).toEqual({ next: "ratna", remaining: 10000 });
  });
  it("returns null/0 at exactly the top threshold (15000) and above", () => {
    expect(nextTierProgress(15000)).toEqual({ next: null, remaining: 0 });
    expect(nextTierProgress(50000)).toEqual({ next: null, remaining: 0 });
  });
  it("remaining never goes negative within a band", () => {
    // 1999 is still sevak; next is pramukh@2000 => remaining 1
    expect(nextTierProgress(1999)).toEqual({ next: "pramukh", remaining: 1 });
  });
});

describe("streakMultiplier — edges", () => {
  it("treats streakDays 0 (or negative) as the 1.0 base", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(-3)).toBe(1);
  });
  it("reaches the 1.5 cap exactly at day 11 and stays there", () => {
    // 1 + 0.05*(11-1) = 1.5
    expect(streakMultiplier(11)).toBe(1.5);
    expect(streakMultiplier(12)).toBe(1.5);
  });
  it("rounds to 2 decimals (day 4 => 1.15)", () => {
    expect(streakMultiplier(4)).toBe(1.15);
  });
});

describe("applyDecay — rounding + non-positive weeks", () => {
  it("is a no-op for zero or negative inactive weeks", () => {
    expect(applyDecay(1234, 0)).toBe(1234);
    expect(applyDecay(1234, -2)).toBe(1234);
  });
  it("compounds 2%/week and rounds to an integer", () => {
    expect(applyDecay(1000, 2)).toBe(Math.round(1000 * 0.98 ** 2)); // 960
    expect(applyDecay(777, 3)).toBe(Math.round(777 * 0.98 ** 3));
  });
  it("decays toward (but stays >= 0) for large week counts", () => {
    const out = applyDecay(100, 365);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThan(100);
  });
});

describe("computeSharePoints — rounding + cap edges", () => {
  it("rounds the raw value to 2 decimals", () => {
    // 2 + 0.1*7 = 2.7
    expect(computeSharePoints(7)).toBeCloseTo(2.7);
  });
  it("hits the cap exactly at reach 280 (2 + 28 = 30)", () => {
    expect(computeSharePoints(280)).toBe(SCORING.SHARE_CAP);
    expect(computeSharePoints(279)).toBeLessThan(SCORING.SHARE_CAP);
  });
});

describe("scoring constants integrity", () => {
  it("TIER_THRESHOLDS are sorted highest-first and start at 0", () => {
    const mins = TIER_THRESHOLDS.map((t) => t.min);
    const sortedDesc = [...mins].sort((a, b) => b - a);
    expect(mins).toEqual(sortedDesc);
    expect(mins[mins.length - 1]).toBe(0);
  });
  it("POOL promote+demote zones fit inside the pool size", () => {
    expect(POOL.PROMOTE_TOP + POOL.DEMOTE_BOTTOM).toBeLessThan(POOL.SIZE);
  });
  it("share spec matches the documented formula constants", () => {
    expect(SCORING.SHARE_BASE).toBe(2);
    expect(SCORING.SHARE_PER_REACH).toBeCloseTo(0.1);
    expect(SCORING.SHARE_CAP).toBe(30);
  });
});
