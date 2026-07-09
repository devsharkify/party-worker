"use client";
/**
 * Voters section — Field tab.
 * Live field-team location table from GET /field/team, with an
 * on-duty filter and a 30s auto-refresh. Rendered by VotersSection.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, SkeletonRow, useToast } from "./ui";
import { type ApiFn, type FieldTeamMember, formatDateTime } from "./voters-shared";

const FIELD_REFRESH_MS = 30_000;
const STALE_AFTER_MS = 3 * 60_000;

type DutyStatus = "live" | "stale" | "off";

const DOT_CLASS: Record<DutyStatus, string> = {
  live: "bg-green-500",
  stale: "bg-amber-400",
  off: "bg-slate-300",
};

const DOT_TITLE: Record<DutyStatus, string> = {
  live: "On duty — reporting live",
  stale: "On duty — location stale",
  off: "Off duty",
};

function dutyStatus(m: FieldTeamMember, now: number): DutyStatus {
  if (!m.onDuty) return "off";
  const seen = new Date(m.updatedAt).getTime();
  if (Number.isNaN(seen) || now - seen >= STALE_AFTER_MS) return "stale";
  return "live";
}

function formatRelative(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function VoterFieldTab({ api }: { api: ApiFn }) {
  const { toast } = useToast();
  const [team, setTeam] = useState<FieldTeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [onDutyOnly, setOnDutyOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      const mySeq = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<FieldTeamMember[]>("/field/team");
        if (seq.current !== mySeq) return;
        setTeam(res);
        setRefreshFailed(false);
        setNow(Date.now());
      } catch (e) {
        if (seq.current !== mySeq) return;
        if (silent) {
          // Keep the last good snapshot; surface the failure inline.
          setRefreshFailed(true);
        } else {
          setTeam([]);
          toast(`Failed to load field team: ${(e as Error).message}`, "error");
        }
      } finally {
        if (seq.current === mySeq && !silent) setLoading(false);
      }
    },
    [api, toast],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // 30s auto-refresh; interval is cleared on unmount (tab switch) or toggle off.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(true), FIELD_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const onDutyCount = useMemo(() => (team ?? []).filter((m) => m.onDuty).length, [team]);

  const visible = useMemo(
    () => (onDutyOnly ? (team ?? []).filter((m) => m.onDuty) : team ?? []),
    [team, onDutyOnly],
  );

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
          {onDutyCount} on duty
        </span>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={onDutyOnly}
            onChange={(e) => setOnDutyOnly(e.target.checked)}
          />
          On duty only
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (30s)
        </label>
        {refreshFailed ? (
          <span className="text-xs font-semibold text-amber-600">
            Last refresh failed — showing previous data
          </span>
        ) : null}
      </div>

      {/* Table */}
      {loading && !team ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : !team || visible.length === 0 ? (
        <EmptyState
          glyph="📍"
          title="No field locations yet"
          message={
            team && team.length > 0
              ? "No one matches the filter. Uncheck “On duty only” to see the full team."
              : "No field locations yet — workers enable duty from the app."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${loading ? "opacity-60" : ""}`}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3" aria-label="Status" />
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-3 py-3">Location</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const status = dutyStatus(m, now);
                  const hasCoords =
                    typeof m.latitude === "number" && typeof m.longitude === "number";
                  return (
                    <tr
                      key={m.userId}
                      className="border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[status]}`}
                          title={DOT_TITLE[status]}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{m.name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{m.role}</td>
                      <td className="px-3 py-2.5 text-slate-600">{m.unitName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{m.phone}</td>
                      <td
                        className="whitespace-nowrap px-3 py-2.5 text-slate-500"
                        title={formatDateTime(m.updatedAt)}
                      >
                        {formatRelative(m.updatedAt, now)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {hasCoords ? (
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">
                              {(m.latitude as number).toFixed(5)}, {(m.longitude as number).toFixed(5)}
                            </span>
                            <a
                              href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-navy hover:underline"
                            >
                              Open map
                            </a>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
