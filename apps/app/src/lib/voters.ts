/**
 * Voter Roll module — shared types + constants.
 * Mirrors the /voters/* API contract exactly.
 */

export type VotingStatus = "unmarked" | "green" | "yellow" | "red";

export interface Voter {
  id: string;
  epicNo: string | null;
  serialNo: string | number | null;
  nameEn: string;
  nameTe: string | null;
  relationName: string | null;
  relationType: string | null;
  gender: string | null;
  age: number | null;
  houseNo: string | null;
  address: string | null;
  mobile: string | null;
  partNo: string | number | null;
  sectionNo: string | number | null;
  votingStatus: VotingStatus;
  isVoted: boolean;
  notes: string | null;
}

export interface VoterPage {
  items: Voter[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VoterAccess {
  enabled: boolean;
  canGrant: boolean;
  canImport: boolean;
  scopeUnit: { id: string; name: string; type: string } | null;
}

export type UnitType = "state" | "district" | "constituency" | "mandal" | "booth";

export interface VoterUnit {
  id: string;
  name: string;
  type: UnitType;
  parentId: string | null;
  voterCount: number;
}

export interface VoterDetail {
  voter: Voter;
  family: Voter[];
}

export interface FamilyMemberInput {
  name: string;
  age?: number;
  gender?: string;
  relation?: string;
  isVoter?: boolean;
}

export interface Survey {
  id: string;
  householdName: string;
  mobile?: string | null;
  supportLevel?: string | null;
  familyMembersCount: number;
  visitDate?: string | null;
  createdAt?: string | null;
}

export interface VoterStats {
  total: number;
  marked: { green: number; yellow: number; red: number; unmarked: number };
  gender: { M: number; F: number; O: number };
  ageBands: { b18_25: number; b26_35: number; b36_50: number; b51_65: number; b66p: number };
  voted: number;
  surveys: number;
  units: Array<{
    id: string;
    name: string;
    type: string;
    total: number;
    green: number;
    yellow: number;
    red: number;
    voted: number;
  }>;
}

/** One field change inside an edit-history entry. */
export interface VoterChange {
  field: string;
  from: string | null;
  to: string | null;
}

/** GET /voters/changes/mine — one row of my edit history. */
export interface MyChangeEntry {
  id: string;
  createdAt: string;
  changes: VoterChange[];
  voter: { id: string; nameEn: string; nameTe: string | null };
}

/** GET /voters/detail/:id/history — one row of a voter's edit history. */
export interface VoterHistoryEntry {
  id: string;
  createdAt: string;
  changes: VoterChange[];
  user: { id: string; name: string };
}

/** Status → dot / bar color (spec-mandated palette). */
export const STATUS_COLORS: Record<VotingStatus, string> = {
  green: "#2B8A3E",
  yellow: "#E8A820",
  red: "#C92A2A",
  unmarked: "#9AA1B0",
};

export const STATUS_LABELS: Record<VotingStatus, { te: string; en: string }> = {
  green: { te: "మద్దతు", en: "Support" },
  yellow: { te: "తటస్థ", en: "Neutral" },
  red: { te: "వ్యతిరేకం", en: "Opposed" },
  unmarked: { te: "గుర్తించలేదు", en: "Unmarked" },
};

export const UNIT_TYPE_LABELS: Record<UnitType, { te: string; en: string }> = {
  state: { te: "రాష్ట్రం", en: "State" },
  district: { te: "జిల్లా", en: "District" },
  constituency: { te: "నియోజకవర్గం", en: "Constituency" },
  mandal: { te: "మండలం", en: "Mandal" },
  booth: { te: "బూత్", en: "Booth" },
};

/** Display name: Telugu name when the UI language is Telugu and one exists. */
export function voterName(v: Voter, lang: "te" | "en"): string {
  return lang === "te" && v.nameTe ? v.nameTe : v.nameEn;
}
