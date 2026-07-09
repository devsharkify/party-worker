"use client";
/**
 * Voters section — Import tab: booth CSV upload, preview, result summary,
 * and import history. Rendered by VotersSection in voters-section.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SkeletonRow, useToast } from "./ui";
import {
  type ApiFn,
  type ImportHistoryRow,
  type ImportResultData,
  type VoterUnit,
  formatDateTime,
  parseCsvLine,
} from "./voters-shared";


/* ================================================================== */
/* Import tab — booth CSV upload + history                             */
/* ================================================================== */

const CSV_HEADERS = [
  "serialNo",
  "epicNo",
  "name (or nameEn)",
  "nameTe",
  "relationName",
  "relationType",
  "gender",
  "age",
  "houseNo",
  "address",
  "mobile",
  "partNo",
  "sectionNo",
  "acNo",
];

const PREVIEW_ROWS = 5;
const MAX_ERRORS_SHOWN = 50;

export function VoterImportTab({ api, units }: { api: ApiFn; units: VoterUnit[] | null }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [boothId, setBoothId] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [csvText, setCsvText] = useState<string>();
  const [readError, setReadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResultData>();
  const [history, setHistory] = useState<ImportHistoryRow[] | null>(null);

  const booths = useMemo(() => (units ?? []).filter((u) => u.type === "booth"), [units]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api<ImportHistoryRow[]>("/voters/imports"));
    } catch {
      setHistory([]);
    }
  }, [api]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const preview = useMemo(() => {
    if (!csvText) return null;
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { headers: [], rows: [], dataRows: 0 };
    return {
      headers: parseCsvLine(lines[0]),
      rows: lines.slice(1, 1 + PREVIEW_ROWS).map(parseCsvLine),
      dataRows: lines.length - 1,
    };
  }, [csvText]);

  function handleFile(file: File) {
    setReadError(undefined);
    setResult(undefined);
    setCsvText(undefined);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        setReadError("The file is empty.");
        return;
      }
      setCsvText(text);
    };
    reader.onerror = () => setReadError("Could not read the file.");
    reader.readAsText(file);
  }

  async function runImport() {
    if (!boothId || !csvText || busy) return;
    setBusy(true);
    setResult(undefined);
    try {
      const res = await api<ImportResultData>("/voters/import", {
        method: "POST",
        body: JSON.stringify({ boothId, filename: fileName, csvText }),
      });
      setResult(res);
      toast(
        `Imported ${res.imported} of ${res.totalRows} rows (${res.skipped} skipped)`,
        res.errors.length ? "info" : "success",
      );
      await loadHistory();
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCsvText(undefined);
    setFileName(undefined);
    setResult(undefined);
    setReadError(undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-bold text-slate-900">Import booth roll (CSV)</h2>
        <p className="mb-4 text-sm text-slate-500">
          Pick a booth, choose a CSV file, preview the first rows, then import. Rows with missing
          required fields are skipped and reported below.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={boothId}
            onChange={(e) => setBoothId(e.target.value)}
            className="max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          >
            <option value="">Select booth…</option>
            {booths.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:font-semibold file:text-white hover:file:brightness-110"
          />
        </div>
        {units !== null && booths.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-amber-600">
            No booth units found — create booths under Organization first.
          </p>
        ) : null}

        {readError ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {readError}
          </p>
        ) : null}

        {preview && !result ? (
          <div className="mt-4">
            <div className="mb-2 text-sm font-bold text-slate-700">
              {fileName} — {preview.dataRows.toLocaleString()} data rows, preview (first{" "}
              {Math.min(PREVIEW_ROWS, preview.rows.length)}):
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2">
                        {h || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {preview.headers.map((_, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {r[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                onClick={runImport}
                disabled={busy || !boothId}
                className="rounded-lg bg-saffron px-5 py-2 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
              >
                {busy ? "Importing…" : `Import ${preview.dataRows.toLocaleString()} rows`}
              </button>
              <button
                onClick={reset}
                className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
            {!boothId ? (
              <p className="mt-2 text-xs font-semibold text-amber-600">Select a booth to enable import.</p>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-3 text-sm font-bold">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {result.totalRows} rows
              </span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                {result.imported} imported
              </span>
              <span
                className={`rounded-full px-3 py-1 ${
                  result.skipped ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {result.skipped} skipped
              </span>
            </div>
            {result.errors.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-rose-200">
                <table className="w-full text-sm">
                  <thead className="bg-rose-50 text-left text-xs font-bold uppercase tracking-wide text-rose-600">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.slice(0, MAX_ERRORS_SHOWN).map((err, i) => (
                      <tr key={i} className="border-t border-rose-100">
                        <td className="px-3 py-2 font-semibold text-slate-700">{err.row}</td>
                        <td className="px-3 py-2 text-rose-700">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.errors.length > MAX_ERRORS_SHOWN ? (
                  <p className="px-3 py-2 text-xs text-slate-400">
                    …and {result.errors.length - MAX_ERRORS_SHOWN} more errors
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              onClick={reset}
              className="mt-3 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
            >
              Import another file
            </button>
          </div>
        ) : null}

        {/* CSV format help */}
        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <h3 className="text-sm font-bold text-sky-800">CSV format</h3>
          <p className="mt-1 text-xs text-sky-700">
            First row must be a header row. Accepted headers (order does not matter):
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CSV_HEADERS.map((h) => (
              <code
                key={h}
                className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200"
              >
                {h}
              </code>
            ))}
          </div>
        </div>
      </section>

      {/* Import history */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-4 text-lg font-bold text-slate-900">
          Import history
        </h2>
        {history === null ? (
          <div className="space-y-3 p-5">
            {[0, 1].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Booth</th>
                  <th className="px-4 py-3">Uploaded by</th>
                  <th className="px-4 py-3 text-right">Rows</th>
                  <th className="px-4 py-3 text-right">Imported</th>
                  <th className="px-4 py-3 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDateTime(h.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{h.filename ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{h.booth.name}</td>
                    <td className="px-4 py-3 text-slate-600">{h.uploadedBy.name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {h.totalRows.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {h.imported.toLocaleString()}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        h.skipped ? "text-rose-600" : "text-slate-400"
                      }`}
                    >
                      {h.skipped.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
