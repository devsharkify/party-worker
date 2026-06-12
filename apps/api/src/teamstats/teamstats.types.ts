// Local response/DTO types for the leader Team-Stats rollup.
// Kept local on purpose — no @pw/shared edits.

export type TeamTier = "karyakarta" | "sevak" | "pramukh" | "nayak" | "ratna";

export interface TeamTierCounts {
  karyakarta: number;
  sevak: number;
  pramukh: number;
  nayak: number;
  ratna: number;
}

export interface TeamTopPerformer {
  userId: string;
  name: string;
  tier: TeamTier;
  weeklyLeaguePoints: number;
}

export interface ChildUnitStat {
  unitId: string;
  unitName: string;
  unitType: string;
  memberCount: number;
  activeMembers: number;
  weeklyPoints: number;
}

export interface TeamStats {
  unitId: string;
  unitName: string;
  memberCount: number;
  activeMembers: number;
  membersWithMembership: number;
  totalWeeklyPoints: number;
  totalLifetime: number;
  totalReach: number;
  totalShares: number;
  byTier: TeamTierCounts;
  topPerformers: TeamTopPerformer[];
  /** Direct child units ranked by weekly activity — the coverage-gap view. */
  childUnits: ChildUnitStat[];
}

export interface InactiveMember {
  userId: string;
  name: string;
  phone: string;
  designation: string | null;
  unitName: string;
  daysIdle: number;
  /** null = never active (registered but never used the app) */
  lastActiveAt: string | null;
}
