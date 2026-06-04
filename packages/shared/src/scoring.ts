import type { Tier } from "./enums";

/**
 * Pure scoring logic shared by API (award engine), app (optimistic UI), and tests.
 * Keep this the single source of truth for the ranking spec.
 */

export const SCORING = {
  /** sharePoints = SHARE_BASE + SHARE_PER_REACH * verifiedReach, capped at SHARE_CAP */
  SHARE_BASE: 2,
  SHARE_PER_REACH: 0.1,
  SHARE_CAP: 30,
  /** recruit: half on referral, half once the recruit is active for RECRUIT_ACTIVE_DAYS */
  RECRUIT_INITIAL: 25,
  RECRUIT_BONUS: 25,
  RECRUIT_ACTIVE_DAYS: 14,
  /** event check-in (QR + GPS verified) */
  EVENT_CHECKIN: 30,
  /** grievance: on file + on resolve */
  GRIEVANCE_FILE: 15,
  GRIEVANCE_RESOLVE: 25,
  /** daily streak */
  STREAK_PER_DAY: 5,
  STREAK_MAX_MULTIPLIER: 1.5,
  /** lifetimeReputation inactivity decay per inactive week */
  INACTIVITY_DECAY_WEEKLY: 0.02,
} as const;

/** Local weekly competition pools. */
export const POOL = {
  SIZE: 30,
  PROMOTE_TOP: 7,
  DEMOTE_BOTTOM: 5,
} as const;

/** Tier thresholds on lifetimeReputation, highest first. */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: Tier; min: number }> = [
  { tier: "ratna", min: 15000 },
  { tier: "nayak", min: 5000 },
  { tier: "pramukh", min: 2000 },
  { tier: "sevak", min: 500 },
  { tier: "karyakarta", min: 0 },
];

export const TIER_LABELS: Record<Tier, { te: string; en: string }> = {
  karyakarta: { te: "కార్యకర్త", en: "Karyakarta" },
  sevak: { te: "సేవక్", en: "Sevak" },
  pramukh: { te: "ప్రముఖ్", en: "Pramukh" },
  nayak: { te: "నాయక్", en: "Nayak" },
  ratna: { te: "రత్న", en: "Ratna" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reach-weighted share points: 2 + 0.1 * verifiedReach, capped at 30. */
export function computeSharePoints(verifiedReach: number): number {
  const reach = Math.max(0, verifiedReach || 0);
  const raw = SCORING.SHARE_BASE + SCORING.SHARE_PER_REACH * reach;
  return Math.min(SCORING.SHARE_CAP, round2(raw));
}

/** Map lifetimeReputation to a tier. */
export function tierForReputation(reputation: number): Tier {
  for (const t of TIER_THRESHOLDS) {
    if (reputation >= t.min) return t.tier;
  }
  return "karyakarta";
}

/** Points to the next tier, or null if already at the top. */
export function nextTierProgress(reputation: number): {
  next: Tier | null;
  remaining: number;
} {
  const ordered = [...TIER_THRESHOLDS].reverse(); // ascending
  const current = tierForReputation(reputation);
  const idx = ordered.findIndex((t) => t.tier === current);
  const next = ordered[idx + 1];
  if (!next) return { next: null, remaining: 0 };
  return { next: next.tier, remaining: Math.max(0, next.min - reputation) };
}

/** Streak multiplier grows 0.05/day from 1.0, capped at 1.5x. */
export function streakMultiplier(streakDays: number): number {
  const m = 1 + 0.05 * Math.max(0, (streakDays || 0) - 1);
  return Math.min(SCORING.STREAK_MAX_MULTIPLIER, round2(m));
}

/** Apply weekly inactivity decay to lifetimeReputation. */
export function applyDecay(reputation: number, inactiveWeeks: number): number {
  if (inactiveWeeks <= 0) return reputation;
  const factor = Math.pow(1 - SCORING.INACTIVITY_DECAY_WEEKLY, inactiveWeeks);
  return Math.round(reputation * factor);
}
