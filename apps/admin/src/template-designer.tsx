"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderTemplate, TemplateZone } from "@pw/shared";
import { useAdmin } from "./admin-auth";
import { EmptyState, SectionHeader, SkeletonRow, useToast } from "./ui";

/* ================================================================== */
/* Template Designer — visually compose render templates              */
/* ------------------------------------------------------------------ */
/* HQ creatives are personalized by overlaying "zones" (worker photo, */
/* name, designation, etc.) on a portrait canvas. This section lets   */
/* HQ design those zone layouts visually and POST them to /templates. */
/* ================================================================== */

/** Canvas pixel dimensions HQ designs against (saved verbatim). */
const CANVAS_W = 1080;
const CANVAS_H = 1920;

/** Design surface is a scaled-down 9:16 portrait of the real canvas. */
const DESIGN_W = 280;
const DESIGN_H = Math.round((DESIGN_W * CANVAS_H) / CANVAS_W); // 498px → true 9:16

/** Every zone kind the shared schema accepts, in palette order. */
const ZONE_KINDS = [
  "photo",
  "name",
  "designation",
  "booth",
  "subtitle",
  "logo",
  "ai_label",
] as const;
type ZoneKind = (typeof ZONE_KINDS)[number];

/** Kinds that render text (and therefore expose font / colour / align). */
const TEXT_KINDS: ReadonlySet<ZoneKind> = new Set([
  "name",
  "designation",
  "booth",
  "subtitle",
  "ai_label",
]);
const isTextKind = (k: ZoneKind) => TEXT_KINDS.has(k);

const KIND_LABEL: Record<ZoneKind, string> = {
  photo: "Photo",
  name: "Name",
  designation: "Designation",
  booth: "Booth",
  subtitle: "Subtitle",
  logo: "Logo",
  ai_label: "AI label",
};

/** Tailwind accent per kind so boxes are visually distinct on the canvas. */
const KIND_COLOR: Record<ZoneKind, { border: string; bg: string; text: string }> = {
  photo: { border: "border-sky-500", bg: "bg-sky-500/15", text: "text-sky-700" },
  name: { border: "border-navy", bg: "bg-navy/10", text: "text-navy" },
  designation: { border: "border-indigo-500", bg: "bg-indigo-500/15", text: "text-indigo-700" },
  booth: { border: "border-emerald-500", bg: "bg-emerald-500/15", text: "text-emerald-700" },
  subtitle: { border: "border-teal-500", bg: "bg-teal-500/15", text: "text-teal-700" },
  logo: { border: "border-saffron", bg: "bg-saffron/15", text: "text-amber-700" },
  ai_label: { border: "border-rose-500", bg: "bg-rose-500/15", text: "text-rose-700" },
};

/** Sensible starting box (normalized) for each kind when added. */
const DEFAULT_ZONE: Record<ZoneKind, Pick<TemplateZone, "x" | "y" | "w" | "h"> & Partial<TemplateZone>> = {
  photo: { x: 0.32, y: 0.18, w: 0.36, h: 0.2, shape: "circle" },
  name: { x: 0.1, y: 0.42, w: 0.8, h: 0.07, fontSize: 64, color: "#0b1f3a", align: "center" },
  designation: { x: 0.1, y: 0.5, w: 0.8, h: 0.05, fontSize: 40, color: "#475569", align: "center" },
  booth: { x: 0.1, y: 0.56, w: 0.8, h: 0.045, fontSize: 34, color: "#475569", align: "center" },
  subtitle: { x: 0.1, y: 0.64, w: 0.8, h: 0.05, fontSize: 36, color: "#0b1f3a", align: "center" },
  logo: { x: 0.74, y: 0.04, w: 0.18, h: 0.1, shape: "rect" },
  ai_label: { x: 0.04, y: 0.93, w: 0.42, h: 0.035, fontSize: 24, color: "#94a3b8", align: "left" },
};

/** Short id without external deps; unique enough for client-side zones. */
function makeId(): string {
  return `z_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Convert a 0..1 fraction to a whole-percent integer and back, for inputs. */
const toPct = (n: number) => Math.round(n * 100);
const fromPct = (n: number) => clamp01(n / 100);

export function TemplateDesigner() {
  const { api } = useAdmin();
  const { toast } = useToast();

  const [name, setName] = useState("New Template");
  const [zones, setZones] = useState<TemplateZone[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState<RenderTemplate[] | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  /** Active drag: which zone + the pointer's offset inside it (normalized). */
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const selected = zones.find((z) => z.id === selectedId) ?? null;

  /* ---- existing templates list ---- */
  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await api<RenderTemplate[]>("/templates"));
    } catch (e) {
      setTemplates([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  /* ---- zone mutations ---- */
  const patchZone = useCallback((id: string, patch: Partial<TemplateZone>) => {
    setZones((cur) => cur.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }, []);

  function addZone(kind: ZoneKind) {
    const d = DEFAULT_ZONE[kind];
    const zone: TemplateZone = {
      id: makeId(),
      kind,
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      rotation: 0,
      ...(d.fontSize !== undefined ? { fontSize: d.fontSize } : {}),
      ...(d.color !== undefined ? { color: d.color } : {}),
      ...(d.align !== undefined ? { align: d.align } : {}),
      ...(d.shape !== undefined ? { shape: d.shape } : {}),
    };
    setZones((cur) => [...cur, zone]);
    setSelectedId(zone.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    setZones((cur) => cur.filter((z) => z.id !== selectedId));
    setSelectedId(null);
  }

  /* ---- drag to move (pointer events, no library) ---- */
  function onZonePointerDown(e: React.PointerEvent, z: TemplateZone) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(z.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Offset of the pointer within the zone, as a fraction of the canvas.
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    drag.current = { id: z.id, dx: px - z.x, dy: py - z.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const zone = zones.find((z) => z.id === d.id);
    if (!zone) return;
    // New top-left, keeping the box fully on-canvas (clamp by its own size).
    const x = Math.min(clamp01(px - d.dx), Math.max(0, 1 - zone.w));
    const y = Math.min(clamp01(py - d.dy), Math.max(0, 1 - zone.h));
    patchZone(d.id, { x, y });
  }

  function endDrag(e: React.PointerEvent) {
    if (drag.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be released */
      }
    }
    drag.current = null;
  }

  /* ---- save ---- */
  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Give the template a name.", "error");
      return;
    }
    if (zones.length === 0) {
      toast("Add at least one zone before saving.", "error");
      return;
    }
    setSaving(true);
    try {
      await api<RenderTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          canvasWidth: CANVAS_W,
          canvasHeight: CANVAS_H,
          zones,
        }),
      });
      toast(`Saved template “${trimmed}”.`, "success");
      // Keep editing context but reset the draft for the next template.
      setName("New Template");
      setZones([]);
      setSelectedId(null);
      await loadTemplates();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const listLoading = templates === null;
  const listCount = templates?.length ?? 0;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Template designer</h2>
            <p className="mt-1 text-sm text-slate-500">
              Drag zones onto a {CANVAS_W}×{CANVAS_H} portrait canvas, then save as a reusable
              render template.
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Template name
            </span>
            <input
              className="w-64 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
            />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          {/* ===== Design canvas ===== */}
          <div className="flex flex-col items-center gap-3">
            <div
              ref={canvasRef}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onPointerDown={() => setSelectedId(null)}
              className="relative touch-none select-none overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-50 shadow-inner"
              style={{
                width: DESIGN_W,
                height: DESIGN_H,
                // Subtle design grid so zones are easy to place.
                backgroundImage:
                  "linear-gradient(to right, rgba(15,31,58,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,31,58,0.06) 1px, transparent 1px)",
                backgroundSize: `${DESIGN_W / 6}px ${DESIGN_H / 8}px`,
              }}
              role="application"
              aria-label="Template design canvas"
            >
              {zones.length === 0 ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-xs font-semibold text-slate-400">
                  Add zones from the palette →
                </div>
              ) : null}

              {zones.map((z) => {
                const kind = z.kind as ZoneKind;
                const c = KIND_COLOR[kind] ?? KIND_COLOR.name;
                const active = z.id === selectedId;
                return (
                  <div
                    key={z.id}
                    onPointerDown={(e) => onZonePointerDown(e, z)}
                    className={`absolute flex cursor-grab items-center justify-center overflow-hidden border-2 text-center text-[9px] font-bold uppercase tracking-wide active:cursor-grabbing ${c.border} ${c.bg} ${c.text} ${
                      z.shape === "circle" ? "rounded-full" : "rounded-md"
                    } ${active ? "ring-2 ring-saffron ring-offset-1" : ""}`}
                    style={{
                      left: `${z.x * 100}%`,
                      top: `${z.y * 100}%`,
                      width: `${z.w * 100}%`,
                      height: `${z.h * 100}%`,
                      transform: z.rotation ? `rotate(${z.rotation}deg)` : undefined,
                    }}
                  >
                    <span className="pointer-events-none px-1 leading-none">{KIND_LABEL[kind]}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">
              {zones.length} zone{zones.length === 1 ? "" : "s"} · drag to position
            </p>
          </div>

          {/* ===== Palette + properties ===== */}
          <div className="space-y-5">
            {/* Add-zone palette */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Add zone
              </div>
              <div className="flex flex-wrap gap-2">
                {ZONE_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => addZone(k)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition hover:brightness-95 ${KIND_COLOR[k].border} ${KIND_COLOR[k].bg} ${KIND_COLOR[k].text}`}
                  >
                    + {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {/* Properties for the selected zone */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              {selected ? (
                <ZoneProperties
                  zone={selected}
                  onChange={(patch) => patchZone(selected.id, patch)}
                  onRemove={removeSelected}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Select a zone on the canvas to edit its size and style, or add one from the
                  palette above.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving || zones.length === 0 || name.trim().length === 0}
                className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Existing templates ===== */}
      <section>
        <SectionHeader title="Existing templates" count={listLoading ? undefined : listCount} />
        <div className="space-y-3">
          {listLoading ? (
            [0, 1].map((i) => <SkeletonRow key={i} />)
          ) : listCount === 0 ? (
            <EmptyState glyph="🧩" title="No templates yet" message="Design and save one above." />
          ) : (
            templates!.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900">{t.name}</div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {t.canvasWidth}×{t.canvasHeight}
                  </span>
                </div>
                {t.zones.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.zones.map((z, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      >
                        {z.kind}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-500">No zones</div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Properties panel for the selected zone                              */
/* ------------------------------------------------------------------ */

function ZoneProperties({
  zone,
  onChange,
  onRemove,
}: {
  zone: TemplateZone;
  onChange: (patch: Partial<TemplateZone>) => void;
  onRemove: () => void;
}) {
  const kind = zone.kind as ZoneKind;
  const text = isTextKind(kind);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-bold ${KIND_COLOR[kind].border} ${KIND_COLOR[kind].bg} ${KIND_COLOR[kind].text}`}
          >
            {KIND_LABEL[kind]}
          </span>
          <span className="text-xs text-slate-400">selected zone</span>
        </div>
        <button
          onClick={onRemove}
          className="rounded-md bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700 transition hover:bg-rose-200"
        >
          Remove
        </button>
      </div>

      {/* Size (width / height as %) */}
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Width %"
          value={toPct(zone.w)}
          min={1}
          max={100}
          onChange={(v) => onChange({ w: fromPct(v) })}
        />
        <NumberField
          label="Height %"
          value={toPct(zone.h)}
          min={1}
          max={100}
          onChange={(v) => onChange({ h: fromPct(v) })}
        />
      </div>

      {/* Text styling */}
      {text ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Font size (px)"
            value={zone.fontSize ?? 40}
            min={8}
            max={300}
            onChange={(v) => onChange({ fontSize: v })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Align
            </span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={zone.align ?? "center"}
              onChange={(e) => onChange({ align: e.target.value as TemplateZone["align"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Color
            </span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={zone.color ?? ""}
              onChange={(e) => onChange({ color: e.target.value })}
              placeholder="#0b1f3a"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
      />
    </label>
  );
}
