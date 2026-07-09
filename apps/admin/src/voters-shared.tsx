"use client";
/**
 * Shared types + small helpers for the HQ Voters section.
 * Types mirror the /voters API contract exactly.
 */
import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Contract types                                                      */
/* ------------------------------------------------------------------ */

export type UnitType = "state" | "district" | "constituency" | "mandal" | "booth";
export type VotingStatus = "unmarked" | "green" | "yellow" | "red";

export interface VotersAccess {
  enabled: boolean;
  canGrant: boolean;
  canImport: boolean;
  scopeUnit: { id: string; name: string; type: UnitType } | null;
}

export interface VoterUnit {
  id: string;
  name: string;
  type: UnitType;
  parentId: string | null;
  voterCount: number;
}

export interface Voter {
  id: string;
  epicNo: string | null;
  serialNo: number | null;
  nameEn: string;
  nameTe: string | null;
  relationName: string | null;
  gender: "M" | "F" | "O" | null;
  age: number | null;
  houseNo: string | null;
  mobile: string | null;
  partNo: number | null;
  sectionNo: number | null;
  votingStatus: VotingStatus;
  isVoted: boolean;
  notes: string | null;
}

export interface VoterListResponse {
  items: Voter[];
  total: number;
  page: number;
  pageSize: number;
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
    type: UnitType;
    total: number;
    green: number;
    yellow: number;
    red: number;
    voted: number;
  }>;
}

export interface SurveyRow {
  id: string;
  householdName: string;
  mobile: string | null;
  supportLevel: string;
  currentPartySupport: string | null;
  incomeRange: string | null;
  familyMembersCount: number | null;
  visitDate: string;
  worker: { id: string; name: string };
  booth: { id: string; name: string };
}

export interface SurveyListResponse {
  items: SurveyRow[];
  total: number;
}

export interface SurveyStatsData {
  total: number;
  supportLevel: { strong: number; leaning: number; neutral: number; opposed: number };
  partySupport: Record<string, number>;
  incomeRange: Record<string, number>;
  housingType: Record<string, number>;
}

export interface GrantRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  orgUnitName: string;
  voterAccessEnabled: boolean;
}

export interface AccessLogRow {
  id: string;
  action: string;
  orgUnitId: string | null;
  voterId: string | null;
  detail: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string };
}

export interface AccessLogResponse {
  items: AccessLogRow[];
  total: number;
}

export interface ImportResultData {
  importId: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface ImportHistoryRow {
  id: string;
  filename: string | null;
  totalRows: number;
  imported: number;
  skipped: number;
  createdAt: string;
  booth: { id: string; name: string };
  uploadedBy: { id: string; name: string };
}

export type ApiFn = <T>(path: string, opts?: RequestInit) => Promise<T>;

/* ------------------------------------------------------------------ */
/* Status display                                                      */
/* ------------------------------------------------------------------ */

export const STATUS_OPTIONS: VotingStatus[] = ["unmarked", "green", "yellow", "red"];

export const STATUS_LABEL: Record<VotingStatus, string> = {
  unmarked: "Unmarked",
  green: "Green",
  yellow: "Yellow",
  red: "Red",
};

export const STATUS_SELECT_CLASS: Record<VotingStatus, string> = {
  unmarked: "border-slate-300 bg-slate-50 text-slate-600",
  green: "border-green-300 bg-green-50 text-green-700",
  yellow: "border-amber-300 bg-amber-50 text-amber-700",
  red: "border-rose-300 bg-rose-50 text-rose-700",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Minimal CSV line parser (handles double-quoted fields) — preview only. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------------ */
/* Pager                                                               */
/* ------------------------------------------------------------------ */

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-sm">
      <span className="text-slate-500">
        {total === 0 ? "No records" : `Showing ${from}–${to} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={disabled || page <= 1}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="font-semibold text-slate-600">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={disabled || page >= pages}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
