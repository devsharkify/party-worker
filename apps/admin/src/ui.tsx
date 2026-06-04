"use client";
import React, { createContext, useCallback, useContext, useState } from "react";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${
              t.tone === "success"
                ? "bg-green-600 text-white ring-green-700"
                : t.tone === "error"
                  ? "bg-red-600 text-white ring-red-700"
                  : "bg-navy text-white ring-white/10"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(ToastCtx);
  if (!c) return { toast: () => undefined };
  return c;
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  sub,
  accent = "navy",
  loading = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "navy" | "saffron" | "green";
  loading?: boolean;
}) {
  const bar =
    accent === "saffron" ? "bg-saffron" : accent === "green" ? "bg-green-600" : "bg-navy";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      {loading ? (
        <div className="mt-2 h-9 w-16 animate-pulse rounded-md bg-slate-200" />
      ) : (
        <div className="mt-1 text-3xl font-extrabold text-slate-900">{value}</div>
      )}
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200" />
    </div>
  );
}

export function EmptyState({ glyph, title, message }: { glyph: string; title: string; message?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="text-3xl">{glyph}</div>
      <div className="mt-2 font-bold text-slate-700">{title}</div>
      {message ? <div className="mt-1 text-sm text-slate-500">{message}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {typeof count === "number" ? (
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
          {count}
        </span>
      ) : null}
    </div>
  );
}
