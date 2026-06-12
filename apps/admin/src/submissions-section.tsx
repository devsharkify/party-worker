"use client";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "./admin-auth";
import { EmptyState, SectionHeader, SkeletonRow, useToast } from "./ui";

// ---- Types ---------------------------------------------------------------

interface SubmissionRow {
  id: string;
  title: string;
  type: "image" | "video";
  sourceUrl: string;
  thumbnailUrl: string | null;
  videoDurationSec: number | null;
  captionVariants: { te?: string; en?: string } | null;
  submittedByName: string;
  submittedByUnit: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h ago`;
  return "just now";
}

// ---- Section ---------------------------------------------------------------

export function SubmissionsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<SubmissionRow[]>("/creatives/submissions");
      setRows(data);
      // Pre-fill editable captions with the submitter's draft (te first).
      setCaptions((prev) => {
        const next = { ...prev };
        for (const r of data) {
          if (next[r.id] === undefined) {
            next[r.id] = r.captionVariants?.te || r.captionVariants?.en || "";
          }
        }
        return next;
      });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(id);
    try {
      const body =
        action === "approve"
          ? { captionVariants: { te: captions[id]?.trim() ?? "", en: captions[id]?.trim() ?? "" } }
          : { note: notes[id]?.trim() || undefined };
      await api(`/creatives/submissions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast(action === "approve" ? "Approved & published to feed" : "Rejected");
      await load();
    } catch (e) {
      toast((e as Error).message ?? "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <SectionHeader title="Submissions" count={rows?.length ?? undefined} />
      <p className="mb-4 text-sm text-slate-500">
        Worker-submitted content awaiting review. Approving publishes straight to the feed.
      </p>

      {loading ? (
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState glyph="📥" title="Nothing to review" message="Worker submissions land here for approval." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative mb-3 overflow-hidden rounded-lg bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.thumbnailUrl ?? r.sourceUrl}
                  alt={r.title}
                  className="aspect-video w-full object-cover"
                />
                {r.type === "video" ? (
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                    ▶ {r.videoDurationSec ? `${r.videoDurationSec}s` : "video"}
                  </span>
                ) : null}
              </div>

              <div className="mb-1 font-semibold text-slate-900">{r.title}</div>
              <div className="mb-2 text-xs text-slate-500">
                {r.submittedByName}
                {r.submittedByUnit ? ` · ${r.submittedByUnit}` : ""} · {timeAgo(r.createdAt)}
              </div>

              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Caption (editable before publish)
              </label>
              <textarea
                value={captions[r.id] ?? ""}
                onChange={(e) => setCaptions((p) => ({ ...p, [r.id]: e.target.value }))}
                rows={2}
                className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none"
              />

              <input
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                placeholder="Rejection note (optional)"
                className="mb-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => void act(r.id, "reject")}
                  disabled={busyId === r.id}
                  className="flex-1 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  onClick={() => void act(r.id, "approve")}
                  disabled={busyId === r.id}
                  className="flex-[1.4] rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
                >
                  {busyId === r.id ? "Working…" : "Approve & publish"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
