"use client";
/**
 * BulkImport — HQ uploads an Excel/CSV of members; rows become workers.
 *
 * Expected columns (header names matched loosely, case-insensitive):
 *   name        — "name", "full name", "member name"
 *   phone       — "phone", "mobile", "mobile number", "phone number", "number"
 *   unit        — "division", "constituency", "unit", "area", "booth", "mandal", "org unit"
 *   designation — "designation", "post", "role title" (optional)
 *
 * The file is parsed client-side with SheetJS, previewed, then POSTed to
 * /org/members/import. Designation is admin-controlled — workers cannot
 * edit it themselves.
 */

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAdmin } from "./admin-auth";
import { useToast } from "./ui";

interface Row {
  name: string;
  phone: string;
  orgUnitName: string;
  designation?: string;
}

interface RowResult {
  phone: string;
  name: string;
  status: "created" | "updated" | "failed";
  reason?: string;
}

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  results: RowResult[];
}

const HEADER_ALIASES: Record<keyof Row, string[]> = {
  name: ["name", "full name", "fullname", "member name", "membername"],
  phone: ["phone", "mobile", "mobile number", "mobilenumber", "phone number", "phonenumber", "number", "contact"],
  orgUnitName: ["division", "constituency", "unit", "area", "booth", "mandal", "org unit", "orgunit", "district"],
  designation: ["designation", "post", "title", "role title"],
};

function matchHeader(headers: string[], field: keyof Row): number {
  const wanted = HEADER_ALIASES[field];
  return headers.findIndex((h) => wanted.includes(h.trim().toLowerCase()));
}

export function BulkImport() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>();
  const [rows, setRows] = useState<Row[]>([]);
  const [parseError, setParseError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult>();

  function handleFile(file: File) {
    setParseError(undefined);
    setResult(undefined);
    setRows([]);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (grid.length < 2) throw new Error("Sheet has no data rows.");

        const headers = (grid[0] as unknown[]).map((h) => String(h));
        const iName = matchHeader(headers, "name");
        const iPhone = matchHeader(headers, "phone");
        const iUnit = matchHeader(headers, "orgUnitName");
        const iDesig = matchHeader(headers, "designation");
        if (iName < 0 || iPhone < 0 || iUnit < 0) {
          throw new Error(
            `Could not find required columns. Found headers: ${headers.join(", ")}. ` +
              `Need: Name, Mobile Number, Division/Constituency (Designation optional).`,
          );
        }

        const parsed: Row[] = [];
        for (const r of grid.slice(1)) {
          const name = String(r[iName] ?? "").trim();
          const phone = String(r[iPhone] ?? "").trim();
          const orgUnitName = String(r[iUnit] ?? "").trim();
          const designation = iDesig >= 0 ? String(r[iDesig] ?? "").trim() : "";
          if (!name && !phone) continue; // blank row
          parsed.push({ name, phone, orgUnitName, ...(designation ? { designation } : {}) });
        }
        if (!parsed.length) throw new Error("No usable rows found.");
        setRows(parsed);
      } catch (e) {
        setParseError((e as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function runImport() {
    if (!rows.length || busy) return;
    setBusy(true);
    try {
      const res = await api<ImportResult>("/org/members/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setResult(res);
      toast(`Imported: ${res.created} created, ${res.updated} updated, ${res.failed} failed.`, res.failed ? "info" : "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName(undefined);
    setResult(undefined);
    setParseError(undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  const failures = result?.results.filter((r) => r.status === "failed") ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-xl font-bold text-slate-900">Bulk import members (Excel/CSV)</h2>
      <p className="mb-4 text-sm text-slate-500">
        Columns: <b>Name</b>, <b>Mobile Number</b>, <b>Division/Constituency</b>, <b>Designation</b> (optional).
        Existing numbers are updated; new numbers are created as workers. Designation can only be set here or by a leader — members cannot edit it themselves.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:font-semibold file:text-white hover:file:brightness-110"
        />
        {fileName ? <span className="text-sm font-semibold text-slate-600">{fileName}</span> : null}
      </div>

      {parseError ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{parseError}</p>
      ) : null}

      {rows.length > 0 && !result ? (
        <div className="mt-4">
          <div className="mb-2 text-sm font-bold text-slate-700">{rows.length} rows ready — preview (first 5):</div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Mobile</th>
                  <th className="px-3 py-2">Division/Unit</th>
                  <th className="px-3 py-2">Designation</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600">{r.phone}</td>
                    <td className="px-3 py-2 text-slate-600">{r.orgUnitName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.designation ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={runImport}
              disabled={busy}
              className="rounded-lg bg-saffron px-5 py-2 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${rows.length} members`}
            </button>
            <button onClick={reset} className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-300">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-3 text-sm font-bold">
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{result.created} created</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">{result.updated} updated</span>
            <span className={`rounded-full px-3 py-1 ${result.failed ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
              {result.failed} failed
            </span>
          </div>
          {failures.length > 0 ? (
            <div className="mt-3 space-y-1">
              {failures.slice(0, 10).map((f, i) => (
                <p key={i} className="text-sm text-rose-700">
                  <b>{f.name || f.phone}</b>: {f.reason}
                </p>
              ))}
              {failures.length > 10 ? (
                <p className="text-xs text-slate-400">…and {failures.length - 10} more</p>
              ) : null}
            </div>
          ) : null}
          <button onClick={reset} className="mt-3 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300">
            Import another file
          </button>
        </div>
      ) : null}
    </section>
  );
}
