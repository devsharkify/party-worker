"use client";
/**
 * Booth Health — leader's command dashboard. Shows WHICH booths are failing,
 * worst-first, so a leader running up to 200 booths can spot the weak ones
 * instantly. Mirrors GET /booth-health exactly.
 */
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "./admin-auth";
import { EmptyState, SkeletonRow, StatCard } from "./ui";
import { buildQuery, type ApiFn } from "./voters-shared";

/* ------------------------------------------------------------------ */
/* Contract types                                                      */
/* ------------------------------------------------------------------ */

type ReasonCode =
  | "no_voter_roll"
  | "low_panna_coverage"
  | "low_canvassing"
  | "no_active_workers"
  | "workers_going_quiet"
  | "no_workers"
  | "no_surveys";

interface BoothHealthRow {
  boothId: string;
  name: string;
  totalVoters: number;
  markedPct: number;
  supportPct: number;
  pannaPct: number;
  workers: number;
  activeWorkers: number;
  surveys: number;
  votedPct: number;
  weaknessScore: number;
  reasons: ReasonCode[];
}

interface BoothHealthSummary {
  boothCount: number;
  weak: number;
  totalVoters: number;
  markedPct: number;
  pannaPct: number;
  activeWorkers: number;
  workers: number;
}

interface BoothHealthResponse {
  booths: BoothHealthRow[];
  summary: BoothHealthSummary;
}

const REASON_LABEL: Record<ReasonCode, string> = {
  no_voter_roll: "No voter roll",
  low_panna_coverage: "Low panna coverage",
  low_canvassing: "Low canvassing",
  no_active_workers: "No active workers",
  workers_going_quiet: "Workers going quiet",
  no_workers: "No workers",
  no_surveys: "No surveys",
};

const WEAK_THRESHOLD = 60;
const FAIR_THRESHOLD = 30;

function severityOf(score: number): "weak" | "fair" | "strong" {
  if (score >= WEAK_THRESHOLD) return "weak";
  if (score >= FAIR_THRESHOLD) return "fair";
  return "strong";
}

const SEVERITY_BADGE: Record<"weak" | "fair" | "strong", { label: string; cls: string }> = {
  weak: { label: "Weak", cls: "bg-rose-100 text-rose-700" },
  fair: { label: "Fair", cls: "bg-amber-100 text-amber-700" },
  strong: { label: "Strong", cls: "bg-green-100 text-green-700" },
};

type SortKey = "weaknessScore" | "totalVoters" | "markedPct" | "supportPct" | "pannaPct" | "workers" | "surveys";

const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "weaknessScore", label: "Weakness" },
  { key: "totalVoters", label: "Voters" },
  { key: "markedPct", label: "Marked %" },
  { key: "supportPct", label: "Support %" },
  { key: "pannaPct", label: "Panna %" },
  { key: "workers", label: "Workers" },
  { key: "surveys", label: "Surveys" },
];

/* ------------------------------------------------------------------ */
/* Org-unit picker (optional scope filter)                             */
/* ------------------------------------------------------------------ */

interface OrgUnitOption {
  id: string;
  name: string;
  type: string;
}

function useOrgUnitOptions(api: ApiFn): OrgUnitOption[] | null {
  const [units, setUnits] = useState<OrgUnitOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<OrgUnitOption[]>("/org/tree");
        if (!cancelled) setUnits(res);
      } catch {
        if (!cancelled) setUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);
  return units;
}

export function BoothHealthSection() {
  const { api } = useAdmin();
  const units = useOrgUnitOptions(api);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [data, setData] = useState<BoothHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [sortKey, setSortKey] = useState<SortKey>("weaknessScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    (async () => {
      try {
        const res = await api<BoothHealthResponse>(`/booth-health${buildQuery({ orgUnitId: orgUnitId || undefined })}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, orgUnitId]);

  const sortedBooths = useMemo(() => {
    const booths = data?.booths ?? [];
    // API already returns worst-first by weaknessScore; re-sort only when the
    // user picks a different column or direction.
    const arr = [...booths];
    arr.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (error) {
    return <EmptyState glyph="🏛️" title="Could not load booth health" message={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Scope filter */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-600">Scope</span>
          <select
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
            disabled={units === null}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
          >
            <option value="">Whole organization</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.type}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">
          Which booths need attention today — sorted worst-first by default.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total booths" value={data ? data.summary.boothCount : "…"} loading={loading} />
        <StatCard
          label="Weak booths"
          value={data ? data.summary.weak : "…"}
          sub={data && data.summary.boothCount > 0 ? `${Math.round((data.summary.weak / data.summary.boothCount) * 100)}% of booths` : undefined}
          loading={loading}
          accent={data && data.summary.weak > 0 ? "saffron" : "navy"}
        />
        <StatCard label="Marked coverage" value={data ? `${data.summary.markedPct}%` : "…"} loading={loading} />
        <StatCard label="Panna coverage" value={data ? `${data.summary.pannaPct}%` : "…"} accent="green" loading={loading} />
        <StatCard
          label="Active workers"
          value={data ? `${data.summary.activeWorkers}/${data.summary.workers}` : "…"}
          loading={loading}
        />
      </div>

      {/* Booth table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-4 text-lg font-bold text-slate-900">
          Booths — worst-first
        </h3>
        {loading && !data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : !data || data.booths.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No booths found in this scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Booth</th>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide transition ${
                          sortKey === col.key ? "text-navy" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          <span aria-hidden>{sortDir === "desc" ? "▾" : "▴"}</span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {sortedBooths.map((b) => {
                  const severity = severityOf(b.weaknessScore);
                  const badge = SEVERITY_BADGE[severity];
                  return (
                    <tr
                      key={b.boothId}
                      className={`border-b border-slate-100 last:border-b-0 ${
                        severity === "weak" ? "bg-rose-50/60" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-navy">{b.name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.cls}`}>
                          {badge.label} · {b.weaknessScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {b.totalVoters.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{b.markedPct}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{b.supportPct}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{b.pannaPct}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {b.activeWorkers}/{b.workers}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{b.surveys}</td>
                      <td className="px-4 py-3">
                        {b.reasons.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {b.reasons.map((r) => (
                              <span
                                key={r}
                                className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                              >
                                {REASON_LABEL[r]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
