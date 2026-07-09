"use client";
/**
 * Voters section — Stats, Surveys and Access tabs.
 * Rendered by VotersSection in voters-section.tsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, SkeletonRow, StatCard, useToast } from "./ui";
import {
  type AccessLogResponse,
  type ApiFn,
  type GrantRow,
  type SurveyListResponse,
  type SurveyStatsData,
  type VoterStats,
  buildQuery,
  formatDate,
  formatDateTime,
  Pager,
  pct,
} from "./voters-shared";

/* ================================================================== */
/* Stats tab — cards, support bar, breakdowns, unit drill-down         */
/* ================================================================== */

interface Crumb {
  id?: string;
  name: string;
}

const AGE_BAND_LABELS: Array<{ key: keyof VoterStats["ageBands"]; label: string }> = [
  { key: "b18_25", label: "18–25" },
  { key: "b26_35", label: "26–35" },
  { key: "b36_50", label: "36–50" },
  { key: "b51_65", label: "51–65" },
  { key: "b66p", label: "66+" },
];

export function VoterStatsTab({ api }: { api: ApiFn }) {
  const [trail, setTrail] = useState<Crumb[]>([{ name: "All units" }]);
  const [stats, setStats] = useState<VoterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const current = trail[trail.length - 1];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    (async () => {
      try {
        const res = await api<VoterStats>(`/voters/stats${buildQuery({ orgUnitId: current.id })}`);
        if (!cancelled) setStats(res);
      } catch (e) {
        if (!cancelled) {
          setStats(null);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, current.id]);

  const marked = stats ? stats.total - stats.marked.unmarked : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Unit drill-down" className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((c, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={`${c.id ?? "root"}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <span className="text-slate-300">/</span> : null}
              {isLast ? (
                <span className="font-bold text-navy">{c.name}</span>
              ) : (
                <button
                  onClick={() => setTrail((prev) => prev.slice(0, i + 1))}
                  className="font-semibold text-slate-500 hover:text-navy"
                >
                  {c.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {error ? (
        <EmptyState glyph="📊" title="Could not load stats" message={error} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total voters"
              value={stats ? stats.total.toLocaleString() : "…"}
              loading={loading}
            />
            <StatCard
              label="Voted"
              value={stats ? stats.voted.toLocaleString() : "…"}
              sub={stats ? `${pct(stats.voted, stats.total)} turnout` : undefined}
              accent="green"
              loading={loading}
            />
            <StatCard
              label="Surveys"
              value={stats ? stats.surveys.toLocaleString() : "…"}
              accent="saffron"
              loading={loading}
            />
            <StatCard
              label="Marked coverage"
              value={stats ? pct(marked, stats.total) : "…"}
              sub={stats ? `${marked.toLocaleString()} of ${stats.total.toLocaleString()}` : undefined}
              loading={loading}
            />
          </div>

          {/* Support stacked bar */}
          {stats ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                Support marking
              </h3>
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-200">
                {(
                  [
                    ["green", stats.marked.green, "bg-green-500"],
                    ["yellow", stats.marked.yellow, "bg-amber-400"],
                    ["red", stats.marked.red, "bg-rose-500"],
                    ["unmarked", stats.marked.unmarked, "bg-slate-300"],
                  ] as const
                ).map(([key, count, cls]) =>
                  stats.total > 0 && count > 0 ? (
                    <div
                      key={key}
                      className={cls}
                      style={{ width: `${(count / stats.total) * 100}%` }}
                      title={`${key}: ${count.toLocaleString()}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  Green {stats.marked.green.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Yellow {stats.marked.yellow.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Red {stats.marked.red.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  Unmarked {stats.marked.unmarked.toLocaleString()}
                </span>
              </div>
            </section>
          ) : null}

          {/* Gender + age bands */}
          {stats ? (
            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Gender
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {(
                      [
                        ["Male", stats.gender.M],
                        ["Female", stats.gender.F],
                        ["Other", stats.gender.O],
                      ] as const
                    ).map(([label, count]) => (
                      <tr key={label} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2 font-semibold text-slate-700">{label}</td>
                        <td className="py-2 text-right font-bold text-slate-900">
                          {count.toLocaleString()}
                        </td>
                        <td className="w-16 py-2 text-right text-slate-400">
                          {pct(count, stats.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Age bands
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {AGE_BAND_LABELS.map(({ key, label }) => (
                      <tr key={key} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2 font-semibold text-slate-700">{label}</td>
                        <td className="py-2 text-right font-bold text-slate-900">
                          {stats.ageBands[key].toLocaleString()}
                        </td>
                        <td className="w-16 py-2 text-right text-slate-400">
                          {pct(stats.ageBands[key], stats.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          ) : null}

          {/* Child-unit drill-down */}
          {stats && stats.units.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h3 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-400">
                Units under {current.name}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3">Unit</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Green</th>
                      <th className="px-4 py-3 text-right">Yellow</th>
                      <th className="px-4 py-3 text-right">Red</th>
                      <th className="px-4 py-3 text-right">Voted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.units.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => setTrail((prev) => [...prev, { id: u.id, name: u.name }])}
                        className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-bold text-navy">{u.name}</td>
                        <td className="px-4 py-3 capitalize text-slate-500">{u.type}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {u.total.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                          {u.green.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-600">
                          {u.yellow.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-600">
                          {u.red.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {u.voted.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Surveys tab — stats + paginated list                                */
/* ================================================================== */

const SURVEY_PAGE_SIZE = 20;

function BreakdownTable({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([key, count]) => (
              <tr key={key} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 font-semibold capitalize text-slate-700">{key}</td>
                <td className="py-2 text-right font-bold text-slate-900">
                  {count.toLocaleString()}
                </td>
                <td className="w-16 py-2 text-right text-slate-400">{pct(count, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function VoterSurveysTab({ api }: { api: ApiFn }) {
  const [stats, setStats] = useState<SurveyStatsData | null>(null);
  const [list, setList] = useState<SurveyListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<SurveyStatsData>("/voters/surveys/stats");
        if (!cancelled) setStats(res);
      } catch {
        if (!cancelled) {
          setStats({
            total: 0,
            supportLevel: { strong: 0, leaning: 0, neutral: 0, opposed: 0 },
            partySupport: {},
            incomeRange: {},
            housingType: {},
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    (async () => {
      try {
        const res = await api<SurveyListResponse>(
          `/voters/surveys${buildQuery({ page, pageSize: SURVEY_PAGE_SIZE })}`,
        );
        if (!cancelled) setList(res);
      } catch {
        if (!cancelled) setList({ items: [], total: 0 });
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, page]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Total surveys"
          value={stats ? stats.total.toLocaleString() : "…"}
          loading={!stats}
        />
        <StatCard
          label="Strong"
          value={stats ? stats.supportLevel.strong.toLocaleString() : "…"}
          accent="green"
          loading={!stats}
        />
        <StatCard
          label="Leaning"
          value={stats ? stats.supportLevel.leaning.toLocaleString() : "…"}
          accent="saffron"
          loading={!stats}
        />
        <StatCard
          label="Neutral"
          value={stats ? stats.supportLevel.neutral.toLocaleString() : "…"}
          loading={!stats}
        />
        <StatCard
          label="Opposed"
          value={stats ? stats.supportLevel.opposed.toLocaleString() : "…"}
          loading={!stats}
        />
      </div>

      {/* Breakdowns */}
      {stats ? (
        <div className="grid gap-6 md:grid-cols-2">
          <BreakdownTable title="Current party support" data={stats.partySupport} />
          <BreakdownTable title="Income range" data={stats.incomeRange} />
        </div>
      ) : null}

      {/* Survey list */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-4 text-lg font-bold text-slate-900">
          Household surveys
        </h3>
        {listLoading && !list ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : !list || list.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No surveys recorded yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${listLoading ? "opacity-60" : ""}`}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Household</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Support</th>
                    <th className="px-4 py-3">Party</th>
                    <th className="px-4 py-3">Income</th>
                    <th className="px-4 py-3 text-right">Members</th>
                    <th className="px-4 py-3">Visited</th>
                    <th className="px-4 py-3">Worker</th>
                    <th className="px-4 py-3">Booth</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3 font-bold text-slate-900">{s.householdName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {s.mobile ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${
                            s.supportLevel === "strong"
                              ? "bg-green-100 text-green-700"
                              : s.supportLevel === "leaning"
                                ? "bg-amber-100 text-amber-700"
                                : s.supportLevel === "opposed"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.supportLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.currentPartySupport ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{s.incomeRange ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {s.familyMembersCount ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDate(s.visitDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.worker.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.booth.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pageSize={SURVEY_PAGE_SIZE}
              total={list.total}
              onPage={setPage}
              disabled={listLoading}
            />
          </>
        )}
      </section>
    </div>
  );
}

/* ================================================================== */
/* Access tab — grants toggles + access log                            */
/* ================================================================== */

const LOG_PAGE_SIZE = 20;

export function VoterAccessTab({ api }: { api: ApiFn }) {
  const { toast } = useToast();
  const [grants, setGrants] = useState<GrantRow[] | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logs, setLogs] = useState<AccessLogResponse | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);

  const loadGrants = useCallback(async () => {
    try {
      setGrants(await api<GrantRow[]>("/voters/grants"));
    } catch {
      setGrants([]);
    }
  }, [api]);

  useEffect(() => {
    void loadGrants();
  }, [loadGrants]);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    (async () => {
      try {
        const res = await api<AccessLogResponse>(
          `/voters/access-logs${buildQuery({ page: logPage, pageSize: LOG_PAGE_SIZE })}`,
        );
        if (!cancelled) setLogs(res);
      } catch {
        if (!cancelled) setLogs({ items: [], total: 0 });
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, logPage]);

  const roles = useMemo(
    () => [...new Set((grants ?? []).map((g) => g.role))].sort(),
    [grants],
  );

  const visibleGrants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (grants ?? []).filter(
      (g) =>
        (!roleFilter || g.role === roleFilter) &&
        (!term || g.name.toLowerCase().includes(term) || g.phone.includes(term)),
    );
  }, [grants, roleFilter, search]);

  async function toggleGrant(g: GrantRow) {
    const next = !g.voterAccessEnabled;
    // Optimistic flip, revert on error.
    setGrants(
      (prev) => prev?.map((r) => (r.id === g.id ? { ...r, voterAccessEnabled: next } : r)) ?? prev,
    );
    try {
      await api(`/voters/grants/${g.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      });
      toast(`Voter access ${next ? "enabled" : "disabled"} for ${g.name}`, "success");
    } catch (e) {
      setGrants(
        (prev) =>
          prev?.map((r) => (r.id === g.id ? { ...r, voterAccessEnabled: !next } : r)) ?? prev,
      );
      toast(`Could not update ${g.name}: ${(e as Error).message}`, "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Grants */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Voter access grants</h3>
            <p className="text-xs text-slate-500">
              Workers can only see and mark voters after access is enabled here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        {grants === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : visibleGrants.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            {grants.length === 0 ? "No members found." : "No members match the filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-center">Voter access</th>
                </tr>
              </thead>
              <tbody>
                {visibleGrants.map((g) => (
                  <tr key={g.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-3 font-bold text-slate-900">{g.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{g.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{g.role}</td>
                    <td className="px-4 py-3 text-slate-600">{g.orgUnitName}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        role="switch"
                        aria-checked={g.voterAccessEnabled}
                        aria-label={`Voter access for ${g.name}`}
                        onClick={() => void toggleGrant(g)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          g.voterAccessEnabled ? "bg-green-600" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            g.voterAccessEnabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Access log */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-4 text-lg font-bold text-slate-900">
          Access log
        </h3>
        {logsLoading && !logs ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : !logs || logs.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No access activity yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${logsLoading ? "opacity-60" : ""}`}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.items.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDateTime(l.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900">{l.user.name}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{l.user.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {l.action}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{l.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={logPage}
              pageSize={LOG_PAGE_SIZE}
              total={logs.total}
              onPage={setLogPage}
              disabled={logsLoading}
            />
          </>
        )}
      </section>
    </div>
  );
}
