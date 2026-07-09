"use client";
/**
 * VotersSection — HQ voter-roll management.
 * Six tabs: Roll · Field · Import · Stats · Surveys · Access.
 * Roll lives here; Field is in voters-field.tsx, Import is in
 * voters-import.tsx and Stats/Surveys/Access are in voters-insights.tsx.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "./admin-auth";
import { EmptyState, SkeletonRow, useToast } from "./ui";
import {
  type ApiFn,
  type Voter,
  type VoterListResponse,
  type VoterUnit,
  type VotersAccess,
  type VotingStatus,
  type VoterHistoryEntry,
  type VoterHistoryResponse,
  buildQuery,
  formatDateTime,
  Pager,
  STATUS_LABEL,
  STATUS_OPTIONS,
  STATUS_SELECT_CLASS,
  useDebounced,
} from "./voters-shared";
import { VoterAccessTab, VoterStatsTab, VoterSurveysTab } from "./voters-insights";
import { VoterImportTab } from "./voters-import";
import { VoterFieldTab } from "./voters-field";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 400;

/* ================================================================== */
/* Section shell + tab bar                                             */
/* ================================================================== */

type VoterTab = "roll" | "field" | "import" | "stats" | "surveys" | "access";

export function VotersSection() {
  const { api } = useAdmin();
  const [access, setAccess] = useState<VotersAccess | null>(null);
  const [accessError, setAccessError] = useState<string>();
  const [units, setUnits] = useState<VoterUnit[] | null>(null);
  const [tab, setTab] = useState<VoterTab>("roll");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await api<VotersAccess>("/voters/access");
        if (!cancelled) setAccess(a);
      } catch (e) {
        if (!cancelled) setAccessError((e as Error).message);
      }
      try {
        const u = await api<VoterUnit[]>("/voters/units");
        if (!cancelled) setUnits(u);
      } catch {
        if (!cancelled) setUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const tabs = useMemo(() => {
    const all: { id: VoterTab; label: string }[] = [
      { id: "roll", label: "Roll" },
      { id: "field", label: "Field" },
      { id: "import", label: "Import" },
      { id: "stats", label: "Stats" },
      { id: "surveys", label: "Surveys" },
      { id: "access", label: "Access" },
    ];
    if (!access) return all;
    return all.filter((t) => {
      if (t.id === "import") return access.canImport;
      if (t.id === "access") return access.canGrant;
      return true;
    });
  }, [access]);

  if (accessError) {
    return (
      <EmptyState
        glyph="🗳️"
        title="Voters module unavailable"
        message={accessError}
      />
    );
  }

  return (
    <div className="space-y-6">
      {access && !access.enabled ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Voter access is not enabled for your scope. Some data may be unavailable.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                active ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "roll" ? <RollTab api={api} units={units} /> : null}
      {tab === "field" ? <VoterFieldTab api={api} /> : null}
      {tab === "import" ? <VoterImportTab api={api} units={units} /> : null}
      {tab === "stats" ? <VoterStatsTab api={api} /> : null}
      {tab === "surveys" ? <VoterSurveysTab api={api} /> : null}
      {tab === "access" ? <VoterAccessTab api={api} /> : null}
    </div>
  );
}

/* ================================================================== */
/* Roll tab — org-unit tree + voter table                              */
/* ================================================================== */

function RollTab({ api, units }: { api: ApiFn; units: VoterUnit[] | null }) {
  const { toast } = useToast();
  const [selectedUnit, setSelectedUnit] = useState<VoterUnit | null>(null);
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, SEARCH_DEBOUNCE_MS);
  const [status, setStatus] = useState("");
  const [gender, setGender] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VoterListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<VotingStatus>("green");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedVoterId, setExpandedVoterId] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Readonly<Record<string, VoterHistoryEntry[]>>>(
    {},
  );
  const [historyError, setHistoryError] = useState<Readonly<Record<string, string>>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const seq = useRef(0);

  const selectedUnitId = selectedUnit?.id;

  // Reset paging + selection whenever the query scope changes.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setExpandedVoterId(null);
  }, [selectedUnitId, q, status, gender]);

  const load = useCallback(async () => {
    const mySeq = ++seq.current;
    setListLoading(true);
    try {
      const query = buildQuery({
        orgUnitId: selectedUnitId,
        status: status || undefined,
        gender: gender || undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      const res = await api<VoterListResponse>(`/voters/list${query}`);
      if (seq.current === mySeq) setData(res);
    } catch (e) {
      if (seq.current === mySeq) {
        setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
        toast(`Failed to load voters: ${(e as Error).message}`, "error");
      }
    } finally {
      if (seq.current === mySeq) setListLoading(false);
    }
  }, [api, selectedUnitId, q, status, gender, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchVoter(id: string, patch: Partial<Pick<Voter, "votingStatus" | "isVoted">>) {
    const prev = data;
    if (!prev) return;
    setData({ ...prev, items: prev.items.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
    try {
      await api(`/voters/detail/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    } catch (e) {
      setData(prev);
      toast(`Update failed: ${(e as Error).message}`, "error");
    }
  }

  async function applyBulk() {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await api<{ updated: number }>("/voters/bulk-update", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected], votingStatus: bulkStatus }),
      });
      toast(`Marked ${res.updated} voters ${STATUS_LABEL[bulkStatus].toLowerCase()}`, "success");
      setSelected(new Set());
      await load();
    } catch (e) {
      toast(`Bulk update failed: ${(e as Error).message}`, "error");
    } finally {
      setBulkBusy(false);
    }
  }

  const loadHistory = useCallback(
    async (id: string) => {
      setHistoryLoadingId(id);
      setHistoryError((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const res = await api<VoterHistoryResponse>(`/voters/detail/${id}/history`);
        setHistoryCache((prev) => ({ ...prev, [id]: res.items }));
      } catch (e) {
        setHistoryError((prev) => ({ ...prev, [id]: (e as Error).message }));
      } finally {
        setHistoryLoadingId((prev) => (prev === id ? null : prev));
      }
    },
    [api],
  );

  function toggleHistory(id: string) {
    if (expandedVoterId === id) {
      setExpandedVoterId(null);
      return;
    }
    setExpandedVoterId(id);
    // Cached results are reused; only fetch on first expand (or after an error).
    if (!historyCache[id] && historyLoadingId !== id) void loadHistory(id);
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageIds = data?.items.map((v) => v.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <UnitTreePanel units={units} selectedId={selectedUnitId} onSelect={setSelectedUnit} />

      <div className="min-w-0 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search name, EPIC, house…"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          >
            <option value="">All genders</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
          {selectedUnit ? (
            <span className="ml-auto rounded-full bg-navy/10 px-3 py-1 text-xs font-bold text-navy">
              {selectedUnit.name}
            </span>
          ) : null}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy/20 bg-navy/5 px-4 py-2.5">
            <span className="text-sm font-bold text-navy">{selected.size} selected</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as VotingStatus)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold outline-none ${STATUS_SELECT_CLASS[bulkStatus]}`}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              onClick={applyBulk}
              disabled={bulkBusy}
              className="rounded-lg bg-saffron px-4 py-1.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {bulkBusy ? "Applying…" : "Apply status"}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        ) : null}

        {/* Table */}
        {listLoading && !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            glyph="🗳️"
            title="No voters found"
            message="Adjust filters or import a booth roll from the Import tab."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${listLoading ? "opacity-60" : ""}`}>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={togglePage}
                        aria-label="Select all on page"
                      />
                    </th>
                    <th className="px-3 py-3">Sl / Part</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Age / Sex</th>
                    <th className="px-3 py-3">House</th>
                    <th className="px-3 py-3">EPIC</th>
                    <th className="px-3 py-3">Mobile</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-center">Voted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <Fragment key={v.id}>
                    <tr
                      className="border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(v.id)}
                          onChange={() => toggleRow(v.id)}
                          aria-label={`Select ${v.nameEn}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                        {v.serialNo ?? "—"}
                        {v.partNo != null ? ` / P${v.partNo}` : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => toggleHistory(v.id)}
                          aria-expanded={expandedVoterId === v.id}
                          title="View change history"
                          className="block text-left"
                        >
                          <div className="font-bold text-slate-900 hover:text-navy hover:underline">
                            {v.nameEn}
                          </div>
                          {v.nameTe ? (
                            <div className="text-xs text-slate-500">{v.nameTe}</div>
                          ) : null}
                          {v.relationName ? (
                            <div className="text-xs text-slate-400">r/o {v.relationName}</div>
                          ) : null}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {v.age ?? "—"} · {v.gender ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{v.houseNo ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">
                        {v.epicNo ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {v.mobile ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={v.votingStatus}
                          onChange={(e) =>
                            void patchVoter(v.id, { votingStatus: e.target.value as VotingStatus })
                          }
                          className={`rounded-lg border px-2 py-1 text-xs font-bold outline-none ${STATUS_SELECT_CLASS[v.votingStatus]}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={v.isVoted}
                          onChange={(e) => void patchVoter(v.id, { isVoted: e.target.checked })}
                          aria-label={`${v.nameEn} voted`}
                        />
                      </td>
                    </tr>
                    {expandedVoterId === v.id ? (
                      <tr className="border-b border-slate-100 bg-slate-50/70 last:border-b-0">
                        <td colSpan={9} className="px-6 py-3">
                          <VoterHistoryPanel
                            entries={historyCache[v.id]}
                            loading={historyLoadingId === v.id}
                            error={historyError[v.id]}
                            onRetry={() => void loadHistory(v.id)}
                          />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onPage={setPage}
              disabled={listLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-voter change history (inline expansion row)                     */
/* ------------------------------------------------------------------ */

function VoterHistoryPanel({
  entries,
  loading,
  error,
  onRetry,
}: {
  entries: VoterHistoryEntry[] | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
}) {
  if (loading && !entries) {
    return <p className="text-xs font-semibold text-slate-400">Loading history…</p>;
  }
  if (error && !entries) {
    return (
      <p className="text-xs font-semibold text-rose-600">
        Could not load history: {error}{" "}
        <button onClick={onRetry} className="font-bold text-navy hover:underline">
          Retry
        </button>
      </p>
    );
  }
  if (!entries || entries.length === 0) {
    return <p className="text-xs text-slate-400">No changes recorded for this voter yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((h) => (
        <li key={h.id} className="text-xs">
          <span className="font-semibold text-slate-500">{formatDateTime(h.createdAt)}</span>
          <span className="mx-1.5 text-slate-300">—</span>
          <span className="font-bold text-slate-800">{h.user.name}</span>
          <span className="text-slate-400">:</span>
          <div className="mt-0.5 space-y-0.5 pl-4">
            {h.changes.map((c, i) => (
              <div key={`${h.id}-${c.field}-${i}`} className="text-slate-600">
                <span className="font-semibold">{c.field}</span>{" "}
                <span className="text-slate-400">{c.from ?? "—"}</span>
                <span className="mx-1 text-slate-300">→</span>
                <span className="font-semibold text-slate-700">{c.to ?? "—"}</span>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Org-unit tree                                                       */
/* ------------------------------------------------------------------ */

function UnitTreePanel({
  units,
  selectedId,
  onSelect,
}: {
  units: VoterUnit[] | null;
  selectedId: string | undefined;
  onSelect: (unit: VoterUnit | null) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { roots, childrenOf } = useMemo(() => {
    const list = units ?? [];
    const ids = new Set(list.map((u) => u.id));
    const map = new Map<string, VoterUnit[]>();
    const rootList: VoterUnit[] = [];
    for (const u of list) {
      if (u.parentId && ids.has(u.parentId)) {
        const arr = map.get(u.parentId) ?? [];
        map.set(u.parentId, [...arr, u]);
      } else {
        rootList.push(u);
      }
    }
    return { roots: rootList, childrenOf: map };
  }, [units]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(unit: VoterUnit, depth: number) {
    const kids = childrenOf.get(unit.id) ?? [];
    const isOpen = expanded.has(unit.id);
    const isSelected = selectedId === unit.id;
    return (
      <div key={unit.id}>
        <div
          className={`flex items-center gap-1 rounded-lg px-1 py-1 ${
            isSelected ? "bg-navy/10" : "hover:bg-slate-100"
          }`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {kids.length > 0 ? (
            <button
              onClick={() => toggle(unit.id)}
              aria-label={isOpen ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-xs text-slate-400 hover:text-slate-700"
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <button
            onClick={() => onSelect(unit)}
            className={`min-w-0 flex-1 truncate text-left text-sm ${
              isSelected ? "font-bold text-navy" : "font-semibold text-slate-700"
            }`}
            title={`${unit.name} (${unit.type})`}
          >
            {unit.name}
          </button>
          <span className="shrink-0 text-[10px] font-bold text-slate-400">
            {unit.voterCount.toLocaleString()}
          </span>
        </div>
        {isOpen ? kids.map((k) => renderNode(k, depth + 1)) : null}
      </div>
    );
  }

  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-32 lg:max-h-[70vh] lg:overflow-y-auto">
      <button
        onClick={() => onSelect(null)}
        className={`mb-1 w-full rounded-lg px-2 py-1.5 text-left text-sm ${
          !selectedId ? "bg-navy/10 font-bold text-navy" : "font-semibold text-slate-700 hover:bg-slate-100"
        }`}
      >
        All voters
      </button>
      {units === null ? (
        <div className="space-y-2 p-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      ) : roots.length === 0 ? (
        <p className="px-2 py-3 text-sm text-slate-400">No units available.</p>
      ) : (
        roots.map((r) => renderNode(r, 0))
      )}
    </aside>
  );
}
