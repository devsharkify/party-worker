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
}
