"use client";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "./admin-auth";
import { EmptyState, SectionHeader, SkeletonRow } from "./ui";

// ---- Types ---------------------------------------------------------------

interface HeatmapRow {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitType: string;
  parentId: string | null;
  totalReach: number;
  totalShares: number;
}

interface TopCreativeRow {
  creativeId: string;
  title: string;
  totalReach: number;
  totalShares: number;
  publishedAt: string | null;
}

type SortKey = "totalReach" | "totalShares" | "ratio";

// ---- Helpers ---------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function ratio(reach: number, shares: number): string {
  if (shares === 0) return "—";
  return (reach / shares).toFixed(1);
}

// ---- Heatmap table ---------------------------------------------------------

function HeatmapTable({
  rows,
  loading,
}: {
  rows: HeatmapRow[] | null;
  loading: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("totalReach");
  const [asc, setAsc] = useState(false);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setAsc((v) => !v);
    } else {
      setSort(key);
      setAsc(false);
    }
  }

  const sorted = rows
    ? [...rows].sort((a, b) => {
        let diff = 0;
        if (sort === "totalReach") diff = a.totalReach - b.totalReach;
        else if (sort === "totalShares") diff = a.totalShares - b.totalShares;
        else {
          const ra = a.totalShares === 0 ? 0 : a.totalReach / a.totalShares;
          const rb = b.totalShares === 0 ? 0 : b.totalReach / b.totalShares;
          diff = ra - rb;
        }
        return asc ? diff : -diff;
      })
    : null;

  const ColHeader = ({
    label,
    col,
    align = "right",
  }: {
    label: string;
    col: SortKey;
    align?: "left" | "right";
  }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label}
      {sort === col ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (!sorted || sorted.length === 0) {
    return (
      <EmptyState
        glyph="🗺️"
        title="No heatmap data"
        message="Reach data will appear here once workers start sharing."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                OrgUnit Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                Type
              </th>
              <ColHeader label="Total Reach" col="totalReach" />
              <ColHeader label="Total Shares" col="totalShares" />
              <ColHeader label="Reach/Share" col="ratio" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.orgUnitId}
                className="border-b border-slate-100 transition hover:bg-slate-50 last:border-b-0"
              >
                <td className="px-4 py-3 font-bold text-slate-900">{row.orgUnitName}</td>
                <td className="px-4 py-3 capitalize text-slate-500">{row.orgUnitType}</td>
                <td className="px-4 py-3 text-right font-extrabold text-navy">
                  {row.totalReach.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-700">
                  {row.totalShares.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-saffron">
                  {ratio(row.totalReach, row.totalShares)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Top Creatives list ----------------------------------------------------

function TopCreativesList({
  rows,
  loading,
}: {
  rows: TopCreativeRow[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        glyph="🎨"
        title="No creative data"
        message="Published creatives will appear here once shared by workers."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((c, i) => (
        <div
          key={c.creativeId}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                i === 0
                  ? "bg-saffron text-white"
                  : i === 1
                    ? "bg-slate-300 text-slate-700"
                    : i === 2
                      ? "bg-amber-700/80 text-white"
                      : "bg-slate-100 text-slate-500"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate font-bold text-slate-900">{c.title}</div>
              <div className="text-xs text-slate-400">{formatDate(c.publishedAt)}</div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-extrabold text-navy">
              {c.totalReach.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">
              {c.totalShares.toLocaleString()} shares
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Main Analytics Section ------------------------------------------------

export function AnalyticsSection() {
  const { api } = useAdmin();
  const [heatmap, setHeatmap] = useState<HeatmapRow[] | null>(null);
  const [topCreatives, setTopCreatives] = useState<TopCreativeRow[] | null>(null);
  const [heatmapOrgType, setHeatmapOrgType] = useState("constituency");

  const loadHeatmap = useCallback(
    async (orgUnitType: string) => {
      setHeatmap(null);
      try {
        setHeatmap(
          await api<HeatmapRow[]>(`/analytics/heatmap?orgUnitType=${orgUnitType}`),
        );
      } catch {
        setHeatmap([]);
      }
    },
    [api],
  );

  const loadTopCreatives = useCallback(async () => {
    try {
      setTopCreatives(await api<TopCreativeRow[]>("/analytics/top-creatives?limit=10"));
    } catch {
      setTopCreatives([]);
    }
  }, [api]);

  useEffect(() => {
    void loadHeatmap(heatmapOrgType);
  }, [loadHeatmap, heatmapOrgType]);

  useEffect(() => {
    void loadTopCreatives();
  }, [loadTopCreatives]);

  const ORG_TYPES = ["state", "district", "constituency", "mandal", "booth"] as const;

  return (
    <div className="space-y-8">
      {/* ===== Constituency Heatmap ===== */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            title="Reach heatmap"
            count={heatmap === null ? undefined : heatmap.length}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Level
            </label>
            <select
              value={heatmapOrgType}
              onChange={(e) => setHeatmapOrgType(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            >
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <HeatmapTable rows={heatmap} loading={heatmap === null} />
      </section>

      {/* ===== Top Creatives ===== */}
      <section>
        <SectionHeader
          title="Top creatives by reach"
          count={topCreatives === null ? undefined : topCreatives.length}
        />
        <TopCreativesList rows={topCreatives} loading={topCreatives === null} />
      </section>
    </div>
  );
}
