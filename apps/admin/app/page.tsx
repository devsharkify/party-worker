"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminGrievanceRow,
  AdminStats,
  CreativeType,
  EventItem,
  GrievanceStatus,
  OrgMemberRow,
  OrgUnitNode,
  OrgUnitType,
  OnboardResult,
  RenderTemplate,
  Role,
} from "@pw/shared";
import {
  assignableRoles,
  childTypeOf,
  ORG_LEVELS,
  ORG_TYPE_LABEL,
  roleFitsUnit,
} from "@pw/shared";
import { useAdmin } from "../src/admin-auth";
import { EmptyState, SectionHeader, SkeletonRow, StatCard, useToast } from "../src/ui";

export default function Page() {
  const { user, loading } = useAdmin();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-400">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-navy" />
          Loading…
        </div>
      </div>
    );
  }
  if (!user) return <Login />;
  const isAdmin = user.role === "hq_admin" || user.role === "state_admin";
  if (!isAdmin) return <NotAuthorized />;
  return <Dashboard />;
}

function NotAuthorized() {
  const { user, logout } = useAdmin();
  return (
    <div className="grid min-h-screen place-items-center bg-navy p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-xl font-extrabold">HQ access only</h1>
        <p className="mt-2 text-sm text-slate-500">
          {user?.name} ({user?.role}) is not an HQ admin. Log in with an HQ account.
        </p>
        <button onClick={logout} className="mt-5 rounded-lg bg-saffron px-5 py-2 font-bold text-white">
          Switch account
        </button>
      </div>
    </div>
  );
}

function Login() {
  const { requestOtp, login } = useAdmin();
  const [phone, setPhone] = useState("9000000001");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [hint, setHint] = useState<string>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(undefined);
    setBusy(true);
    try {
      const r = await requestOtp(phone);
      setHint(r.devHint);
      setStep("otp");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setErr(undefined);
    setBusy(true);
    try {
      await login(phone, code);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-navy to-[#081628] p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-2 border-saffron bg-saffron/10 text-3xl text-saffron">
          ★
        </div>
        <h1 className="text-center text-2xl font-extrabold">Party Worker — HQ</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Content studio &amp; compliance</p>

        {step === "phone" ? (
          <>
            <label className="mb-1 block text-sm font-semibold">Admin mobile number</label>
            <input
              className="mb-4 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              disabled={busy}
              className="w-full rounded-lg bg-saffron py-3 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-semibold">Enter OTP</label>
            <input
              className="mb-2 w-full rounded-lg border border-slate-300 px-4 py-3 tracking-[0.3em] outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              onKeyDown={(e) => e.key === "Enter" && verify()}
            />
            {hint ? <p className="mb-3 text-sm text-slate-500">Dev code: {hint}</p> : null}
            <button
              onClick={verify}
              disabled={busy}
              className="w-full rounded-lg bg-saffron py-3 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify & enter"}
            </button>
            <button
              onClick={() => setStep("phone")}
              className="mt-3 w-full text-center text-sm font-semibold text-slate-400 hover:text-slate-600"
            >
              ← Change number
            </button>
          </>
        )}
        {err ? <p className="mt-4 text-center text-sm font-semibold text-red-600">{err}</p> : null}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Dashboard shell + top navigation                                   */
/* ================================================================== */

type Section = "overview" | "studio" | "organization" | "grievances" | "events" | "broadcast";

const NAV: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "studio", label: "Studio" },
  { id: "organization", label: "Organization" },
  { id: "grievances", label: "Grievances" },
  { id: "events", label: "Events" },
  { id: "broadcast", label: "Broadcast & Insights" },
];

function Dashboard() {
  const { user, logout } = useAdmin();
  const [section, setSection] = useState<Section>("overview");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-extrabold">★ Party Worker HQ</span>
            <span className="hidden text-sm text-slate-300 sm:inline">Content Studio &amp; Compliance</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{user?.name}</span>
            <button
              onClick={logout}
              className="rounded-md bg-white/10 px-3 py-1.5 font-semibold transition hover:bg-white/20"
            >
              Log out
            </button>
          </div>
        </div>
        {/* Segmented section nav (no routing — local state) */}
        <nav className="mx-auto max-w-6xl px-6">
          <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Sections">
            {NAV.map((n) => {
              const active = section === n.id;
              return (
                <button
                  key={n.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(n.id)}
                  className={`relative whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-bold transition ${
                    active ? "text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  {n.label}
                  <span
                    className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition ${
                      active ? "bg-saffron" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-6">
        {section === "overview" ? <OverviewSection /> : null}
        {section === "studio" ? <StudioSection /> : null}
        {section === "organization" ? <OrganizationSection /> : null}
        {section === "grievances" ? <GrievancesSection /> : null}
        {section === "events" ? <EventsSection /> : null}
        {section === "broadcast" ? <BroadcastSection /> : null}
      </main>
    </div>
  );
}

/* ================================================================== */
/* Overview — driven by GET /admin/stats                              */
/* ================================================================== */

const TIER_LABEL: Record<string, string> = {
  karyakarta: "Karyakarta",
  sevak: "Sevak",
  pramukh: "Pramukh",
  nayak: "Nayak",
  ratna: "Ratna",
};

/** Display order + labels for the grievance status breakdown. */
const GRIEVANCE_META: { status: GrievanceStatus; label: string; dot: string }[] = [
  { status: "open", label: "Open", dot: "bg-amber-500" },
  { status: "routed", label: "Routed", dot: "bg-sky-500" },
  { status: "in_progress", label: "In progress", dot: "bg-indigo-500" },
  { status: "resolved", label: "Resolved", dot: "bg-green-600" },
  { status: "rejected", label: "Rejected", dot: "bg-rose-500" },
];

function OverviewSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api<AdminStats>("/admin/stats"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = stats === null;
  const certifiedPct =
    stats && stats.creativesPublished > 0
      ? `${Math.round((stats.mcmcCertified / stats.creativesPublished) * 100)}% of live`
      : undefined;
  const publishedPct =
    stats && stats.creativesTotal > 0
      ? `${Math.round((stats.creativesPublished / stats.creativesTotal) * 100)}% live`
      : undefined;

  const grievanceTotal = useMemo(
    () =>
      stats
        ? GRIEVANCE_META.reduce((sum, m) => sum + (stats.grievances[m.status] ?? 0), 0)
        : 0,
    [stats],
  );

  return (
    <div className="space-y-8">
      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Workers" value={stats?.workers ?? 0} accent="navy" loading={loading} />
        <StatCard label="Active members" value={stats?.membersActive ?? 0} accent="saffron" loading={loading} />
        <StatCard label="Creatives" value={stats?.creativesTotal ?? 0} accent="navy" loading={loading} />
        <StatCard
          label="Published"
          value={stats?.creativesPublished ?? 0}
          sub={publishedPct}
          accent="green"
          loading={loading}
        />
        <StatCard
          label="MCMC certified"
          value={stats?.mcmcCertified ?? 0}
          sub={certifiedPct}
          accent="saffron"
          loading={loading}
        />
        <StatCard
          label="Total shares"
          value={(stats?.totalShares ?? 0).toLocaleString()}
          accent="navy"
          loading={loading}
        />
        <StatCard
          label="Total reach"
          value={(stats?.totalReach ?? 0).toLocaleString()}
          accent="green"
          loading={loading}
        />
        <StatCard label="Events" value={stats?.events ?? 0} accent="navy" loading={loading} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Top performers */}
        <section className="lg:col-span-2">
          <SectionHeader
            title="Top performers"
            count={loading ? undefined : (stats?.topPerformers.length ?? 0)}
          />
          <div className="space-y-3">
            {loading ? (
              [0, 1, 2].map((i) => <SkeletonRow key={i} />)
            ) : (stats?.topPerformers.length ?? 0) === 0 ? (
              <EmptyState glyph="🏆" title="No performers yet" message="Weekly league points appear here." />
            ) : (
              stats!.topPerformers.map((p, i) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${
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
                    <div>
                      <div className="font-bold text-slate-900">{p.name}</div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {TIER_LABEL[p.tier] ?? p.tier}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-navy">
                      {p.weeklyLeaguePoints.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">league pts</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Grievances by status */}
        <section>
          <SectionHeader title="Grievances by status" count={loading ? undefined : grievanceTotal} />
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-3">
                {GRIEVANCE_META.map((m) => {
                  const n = stats?.grievances[m.status] ?? 0;
                  const pct = grievanceTotal > 0 ? (n / grievanceTotal) * 100 : 0;
                  return (
                    <div key={m.status}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-semibold text-slate-700">
                          <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                          {m.label}
                        </span>
                        <span className="font-bold text-slate-900">{n}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={`block h-full rounded-full ${m.dot}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {grievanceTotal === 0 ? (
                <p className="mt-4 text-center text-sm text-slate-400">No grievances filed yet.</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Studio — existing creatives flow (unchanged behavior)              */
/* ================================================================== */

interface CreativeRow {
  id: string;
  title: string;
  type: string;
  published: boolean;
  mcmcCertified: boolean;
  aiLabeled: boolean;
  mcmcCertId: string | null;
  /** Org subtree this creative is published to; null = whole org (all workers). */
  targetOrgUnitId: string | null;
}

function StudioSection() {
  const { api, uploadFile } = useAdmin();
  const { toast } = useToast();
  const [creatives, setCreatives] = useState<CreativeRow[] | null>(null);
  const [templates, setTemplates] = useState<RenderTemplate[] | null>(null);
  const [org, setOrg] = useState<OrgUnitNode[] | null>(null);

  const loadCreatives = useCallback(async () => {
    try {
      setCreatives(await api<CreativeRow[]>("/creatives"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  const loadAux = useCallback(async () => {
    // Templates + org tree power the studio sidebar; failures degrade gracefully.
    const [tpls, tree] = await Promise.allSettled([
      api<RenderTemplate[]>("/templates"),
      api<OrgUnitNode[]>("/org/tree"),
    ]);
    if (tpls.status === "fulfilled") setTemplates(tpls.value);
    else setTemplates([]);
    if (tree.status === "fulfilled") setOrg(tree.value);
    else setOrg([]);
  }, [api]);

  useEffect(() => {
    void loadCreatives();
    void loadAux();
  }, [loadCreatives, loadAux]);

  const totalCreatives = creatives?.length ?? 0;
  const templateCount = templates?.length ?? 0;
  const creativesLoading = creatives === null;
  const auxLoading = org === null;

  return (
    <div className="space-y-8">
      {/* ===== Create creative ===== */}
      <CreateCreative
        org={org}
        onCreated={async () => {
          await loadCreatives();
          toast("Draft created.", "success");
        }}
        uploadFile={uploadFile}
        create={(body) => api("/creatives", { method: "POST", body: JSON.stringify(body) })}
        onError={(m) => toast(m, "error")}
      />

      {/* ===== Creatives + Templates ===== */}
      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader title="Creatives" count={creativesLoading ? undefined : totalCreatives} />
          <div className="space-y-3">
            {creativesLoading ? (
              [0, 1, 2].map((i) => <SkeletonRow key={i} />)
            ) : totalCreatives === 0 ? (
              <EmptyState glyph="🎨" title="No creatives yet" message="Create your first draft above." />
            ) : (
              creatives!.map((c) => (
                <CreativeCard
                  key={c.id}
                  c={c}
                  org={org}
                  onCertify={async (certId) => {
                    await api(`/creatives/${c.id}/certify`, {
                      method: "POST",
                      body: JSON.stringify({ mcmcCertId: certId }),
                    });
                    toast(`Certified “${c.title}” (${certId}).`, "success");
                    await loadCreatives();
                  }}
                  onPublish={async () => {
                    try {
                      await api(`/creatives/${c.id}/publish`, { method: "POST" });
                      toast(`Published “${c.title}” — now in the worker feed.`, "success");
                      await loadCreatives();
                    } catch (e) {
                      toast(`Publish blocked: ${(e as Error).message}`, "error");
                    }
                  }}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Templates" count={auxLoading ? undefined : templateCount} />
          <div className="space-y-3">
            {auxLoading ? (
              [0, 1].map((i) => <SkeletonRow key={i} />)
            ) : templateCount === 0 ? (
              <EmptyState glyph="🧩" title="No templates" message="Render templates appear here." />
            ) : (
              templates!.map((tpl) => <TemplateCard key={tpl.id} t={tpl} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TemplateCard({ t }: { t: RenderTemplate }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="font-bold text-slate-900">{t.name}</div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {t.canvasWidth}×{t.canvasHeight}
        </span>
      </div>
      <div className="mt-1 text-sm text-slate-500">
        {t.zones.length} zone{t.zones.length === 1 ? "" : "s"}
      </div>
      {t.zones.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.zones.slice(0, 6).map((z, i) => (
            <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {z.kind}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateCreative({
  org,
  onCreated,
  uploadFile,
  create,
  onError,
}: {
  org: OrgUnitNode[] | null;
  onCreated: () => Promise<void>;
  uploadFile: (f: File) => Promise<{ key: string }>;
  create: (body: unknown) => Promise<unknown>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CreativeType>("image");
  const [te, setTe] = useState("");
  const [en, setEn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // "" = All workers (org-wide); otherwise an org unit id.
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [busy, setBusy] = useState(false);

  const orgLoading = org === null;

  async function submit() {
    if (!title) return;
    setBusy(true);
    try {
      const sourceKey = file ? (await uploadFile(file)).key : "seed/manifesto.png";
      await create({
        title,
        type,
        sourceKey,
        captionVariants: { te, en },
        languages: ["te", "en"],
        // Specific subtree → send the id; "All workers" → omit (whole org).
        ...(targetOrgUnitId ? { targetOrgUnitId } : {}),
      });
      setTitle("");
      setTe("");
      setEn("");
      setFile(null);
      setTargetOrgUnitId("");
      await onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">New creative</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          value={type}
          onChange={(e) => setType(e.target.value as CreativeType)}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="carousel">Carousel</option>
        </select>
        <textarea
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="తెలుగు caption"
          value={te}
          onChange={(e) => setTe(e.target.value)}
        />
        <textarea
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="English caption"
          value={en}
          onChange={(e) => setEn(e.target.value)}
        />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Audience
          </span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
            value={targetOrgUnitId}
            onChange={(e) => setTargetOrgUnitId(e.target.value)}
            disabled={orgLoading}
          >
            <option value="">All workers (org-wide)</option>
            {(org ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.type}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            {orgLoading
              ? "Loading org tree…"
              : (org?.length ?? 0) === 0
                ? "Org tree unavailable — publishing to all workers."
                : "Broadcast to everyone, or scope to one part of the org tree."}
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700"
        />
        <button
          onClick={submit}
          disabled={busy || !title}
          className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create draft"}
        </button>
      </div>
    </section>
  );
}

function CreativeCard({
  c,
  org,
  onCertify,
  onPublish,
}: {
  c: CreativeRow;
  org: OrgUnitNode[] | null;
  onCertify: (certId: string) => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  const [certId, setCertId] = useState("MCMC/TG/2026/");
  const [busy, setBusy] = useState(false);

  // Resolve the target unit from the cached org tree; fall back to the raw id.
  const audience = (() => {
    if (!c.targetOrgUnitId) return "All workers";
    const unit = org?.find((u) => u.id === c.targetOrgUnitId);
    return unit ? `${unit.name} · ${unit.type}` : c.targetOrgUnitId;
  })();
  const orgWide = !c.targetOrgUnitId;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-slate-900">{c.title}</div>
          <div className="text-sm capitalize text-slate-500">{c.type}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge ok={c.published} okText="Published" noText="Draft" />
          <Badge ok={c.mcmcCertified} okText="MCMC ✓" noText="Uncertified" />
          <Badge ok={c.aiLabeled} okText="AI-labeled" noText="No AI label" />
        </div>
      </div>
      <div className="mt-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
            orgWide ? "bg-navy/10 text-navy" : "bg-saffron/15 text-saffron"
          }`}
        >
          <span aria-hidden>{orgWide ? "🌐" : "🎯"}</span>
          {audience}
        </span>
      </div>
      {!c.published ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {!c.mcmcCertified ? (
            <>
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-saffron"
                value={certId}
                onChange={(e) => setCertId(e.target.value)}
              />
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onCertify(certId);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold transition hover:bg-slate-300 disabled:opacity-50"
              >
                Certify (MCMC)
              </button>
            </>
          ) : null}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onPublish();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-green-600 px-3 py-1 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Badge({ ok, okText, noText }: { ok: boolean; okText: string; noText: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        ok ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ok ? okText : noText}
    </span>
  );
}

/* ================================================================== */
/* Organization — hierarchy tree, create unit, onboard members        */
/* ================================================================== */

/** Readable labels for the roles HQ can assign. */
const ROLE_LABEL: Record<Role, string> = {
  worker: "Worker",
  booth_leader: "Booth Leader",
  mandal_leader: "Mandal Leader",
  constituency_leader: "Constituency Leader",
  district_leader: "District Leader",
  state_admin: "State Admin",
  hq_admin: "HQ Admin",
};

function OrganizationSection() {
  const { api, user } = useAdmin();
  const { toast } = useToast();
  const [tree, setTree] = useState<OrgUnitNode[] | null>(null);
  const [manageable, setManageable] = useState<OrgUnitNode[] | null>(null);

  const loadTree = useCallback(async () => {
    try {
      setTree(await api<OrgUnitNode[]>("/org/tree"));
    } catch (e) {
      setTree([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  const loadManageable = useCallback(async () => {
    try {
      setManageable(await api<OrgUnitNode[]>("/org/manageable"));
    } catch (e) {
      setManageable([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => {
    void loadTree();
    void loadManageable();
  }, [loadTree, loadManageable]);

  return (
    <div className="space-y-8">
      <HierarchyTree tree={tree} />

      <div className="grid gap-8 lg:grid-cols-2">
        <CreateUnit
          manageable={manageable}
          create={(body) =>
            api<OrgUnitNode>("/org/units", { method: "POST", body: JSON.stringify(body) })
          }
          onCreated={async (unit) => {
            // Refresh both the tree (also feeds the Studio audience picker via /org/tree)
            // and the manageable list so the new unit can be a parent / onboard target.
            await Promise.all([loadTree(), loadManageable()]);
            toast(`Created ${ORG_TYPE_LABEL[unit.type]} “${unit.name}”.`, "success");
          }}
          onError={(m) => toast(m, "error")}
        />

        <OnboardMember
          manageable={manageable}
          actorRole={user?.role ?? "worker"}
          onboard={(body) =>
            api<OnboardResult>("/org/members", { method: "POST", body: JSON.stringify(body) })
          }
          loadMembers={(unitId) =>
            api<OrgMemberRow[]>(`/org/units/${unitId}/members?subtree=true`)
          }
          onOnboarded={async (res) => {
            await Promise.all([loadTree(), loadManageable()]);
            if (res.recruiterPointsAwarded > 0) {
              toast(`+${res.recruiterPointsAwarded} pts`, "success");
            }
            toast(`Onboarded ${res.member.name}.`, "success");
          }}
          onError={(m) => toast(m, "error")}
        />
      </div>
    </div>
  );
}

/** Card 1 — read-only indented org hierarchy from GET /org/tree. */
function HierarchyTree({ tree }: { tree: OrgUnitNode[] | null }) {
  const loading = tree === null;
  const count = tree?.length ?? 0;
  return (
    <section>
      <SectionHeader title="Hierarchy tree" count={loading ? undefined : count} />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : count === 0 ? (
        <EmptyState
          glyph="🌳"
          title="No org units yet"
          message="Create your first unit below to start the hierarchy."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tree!.map((u) => {
            const depth = Math.max(0, ORG_LEVELS.indexOf(u.type));
            return (
              <div
                key={u.id}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"
                style={{ paddingLeft: `${16 + depth * 22}px` }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {depth > 0 ? <span className="text-slate-300">↳</span> : null}
                  <span className="truncate font-bold text-slate-900">{u.name}</span>
                  <span className="rounded-full bg-saffron/15 px-2 py-0.5 text-xs font-bold text-saffron">
                    {ORG_TYPE_LABEL[u.type]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">
                  <span title="Members">👥 {u.memberCount}</span>
                  <span title="Child units">🗂 {u.childrenCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Card 2 — create a new org unit under a chosen parent. */
function CreateUnit({
  manageable,
  create,
  onCreated,
  onError,
}: {
  manageable: OrgUnitNode[] | null;
  create: (body: unknown) => Promise<OrgUnitNode>;
  onCreated: (unit: OrgUnitNode) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const loading = manageable === null;
  const parent = (manageable ?? []).find((u) => u.id === parentId) ?? null;
  // Child type is derived from the parent's type; null means the parent is a leaf (booth).
  const childType: OrgUnitType | null = parent ? childTypeOf(parent.type) : null;
  const canSubmit = !!parent && childType !== null && name.trim().length > 0 && !busy;

  async function submit() {
    if (!parent || !childType || !name.trim()) return;
    setBusy(true);
    try {
      const unit = await create({ name: name.trim(), type: childType, parentId: parent.id });
      setName("");
      setParentId("");
      await onCreated(unit);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Create unit</h2>
      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Parent unit
          </span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={loading}
          >
            <option value="">{loading ? "Loading…" : "Select a parent…"}</option>
            {(manageable ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ORG_TYPE_LABEL[u.type]}
              </option>
            ))}
          </select>
        </label>

        {parent ? (
          childType ? (
            <div className="rounded-lg bg-navy/5 px-3 py-2 text-sm font-semibold text-navy">
              Will create a: {ORG_TYPE_LABEL[childType]}
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
              {ORG_TYPE_LABEL[parent.type]} is the lowest level — no child units can be created
              under it.
            </div>
          )
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Name</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder={childType ? `New ${ORG_TYPE_LABEL[childType]} name` : "Unit name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create unit"}
        </button>
      </div>
    </section>
  );
}

/** Card 3 — onboard a member into a unit, with a subtree roster below. */
function OnboardMember({
  manageable,
  actorRole,
  onboard,
  loadMembers,
  onOnboarded,
  onError,
}: {
  manageable: OrgUnitNode[] | null;
  actorRole: Role;
  onboard: (body: unknown) => Promise<OnboardResult>;
  loadMembers: (unitId: string) => Promise<OrgMemberRow[]>;
  onOnboarded: (res: OnboardResult) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [orgUnitId, setOrgUnitId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [designation, setDesignation] = useState("");
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<OrgMemberRow[] | null>(null);

  const loading = manageable === null;
  const unit = (manageable ?? []).find((u) => u.id === orgUnitId) ?? null;

  // Roles this admin may assign, narrowed to those that fit the selected unit's type.
  const roleOptions = useMemo<Role[]>(() => {
    const assignable = assignableRoles(actorRole);
    if (!unit) return assignable;
    return assignable.filter((r) => roleFitsUnit(r, unit.type));
  }, [actorRole, unit]);

  // Keep the selected role valid for the current unit.
  useEffect(() => {
    if (!roleOptions.includes(role)) {
      setRole(roleOptions[0] ?? "worker");
    }
  }, [roleOptions, role]);

  const refreshRoster = useCallback(
    async (unitId: string) => {
      if (!unitId) {
        setRoster(null);
        return;
      }
      setRoster(null);
      try {
        setRoster(await loadMembers(unitId));
      } catch (e) {
        setRoster([]);
        onError((e as Error).message);
      }
    },
    [loadMembers, onError],
  );

  // Load the roster whenever a unit is selected.
  useEffect(() => {
    void refreshRoster(orgUnitId);
  }, [orgUnitId, refreshRoster]);

  const canSubmit = !!unit && name.trim().length > 0 && phone.trim().length > 0 && !busy;

  async function submit() {
    if (!unit || !name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      const res = await onboard({
        name: name.trim(),
        phone: phone.trim(),
        role,
        orgUnitId: unit.id,
        ...(designation.trim() ? { designation: designation.trim() } : {}),
      });
      setName("");
      setPhone("");
      setDesignation("");
      await onOnboarded(res);
      await refreshRoster(unit.id); // show the freshly onboarded member
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Onboard member</h2>
      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Unit</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
            disabled={loading}
          >
            <option value="">{loading ? "Loading…" : "Select a unit…"}</option>
            {(manageable ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ORG_TYPE_LABEL[u.type]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder="Phone (e.g. 9000001234)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Role
            </span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={!unit}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <input
            className="self-end rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder="Designation (optional)"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-saffron px-5 py-2 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Onboarding…" : "Onboard member"}
        </button>
      </div>

      {/* Roster for the selected unit (subtree) */}
      {orgUnitId ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <SectionHeader
            title={`Roster${unit ? ` — ${unit.name}` : ""}`}
            count={roster === null ? undefined : roster.length}
          />
          {roster === null ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : roster.length === 0 ? (
            <EmptyState glyph="🧑‍🤝‍🧑" title="No members" message="Onboard the first member above." />
          ) : (
            <div className="space-y-2">
              {roster.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        m.membershipActive ? "bg-green-500" : "bg-slate-300"
                      }`}
                      title={m.membershipActive ? "Membership active" : "Membership inactive"}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-500">
                        {ROLE_LABEL[m.role]} · {TIER_LABEL[m.tier] ?? m.tier} · {m.phone}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-extrabold text-navy">
                      {m.weeklyLeaguePoints.toLocaleString()}{" "}
                      <span className="font-semibold text-slate-400">wk</span>
                    </div>
                    <div className="text-slate-400">
                      {m.lifetimeReputation.toLocaleString()} lifetime
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ================================================================== */
/* Grievances inbox — GET /admin/grievances + PATCH status            */
/* ================================================================== */

const GRIEVANCE_STATUSES: GrievanceStatus[] = ["open", "routed", "in_progress", "resolved", "rejected"];

const STATUS_LABEL: Record<GrievanceStatus, string> = {
  open: "Open",
  routed: "Routed",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_PILL: Record<GrievanceStatus, string> = {
  open: "bg-amber-100 text-amber-700",
  routed: "bg-sky-100 text-sky-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  resolved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function GrievancesSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminGrievanceRow[] | null>(null);
  const [filter, setFilter] = useState<GrievanceStatus | "all">("all");

  const load = useCallback(
    async (status: GrievanceStatus | "all") => {
      setRows(null);
      try {
        const qs = status === "all" ? "" : `?status=${status}`;
        setRows(await api<AdminGrievanceRow[]>(`/admin/grievances${qs}`));
      } catch (e) {
        setRows([]);
        toast((e as Error).message, "error");
      }
    },
    [api, toast],
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  async function changeStatus(row: AdminGrievanceRow, next: GrievanceStatus) {
    if (next === row.status) return;
    const prev = rows;
    // Optimistic update.
    setRows((cur) =>
      cur ? cur.map((r) => (r.id === row.id ? { ...r, status: next } : r)) : cur,
    );
    try {
      await api<AdminGrievanceRow>(`/admin/grievances/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      toast(`“${row.title}” → ${STATUS_LABEL[next]}.`, "success");
      await load(filter); // reload on success
    } catch (e) {
      setRows(prev); // rollback
      toast(`Update failed: ${(e as Error).message}`, "error");
    }
  }

  const loading = rows === null;
  const count = rows?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {GRIEVANCE_STATUSES.map((s) => (
          <Chip
            key={s}
            label={STATUS_LABEL[s]}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      <SectionHeader title="Grievance inbox" count={loading ? undefined : count} />

      <div className="space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => <SkeletonRow key={i} />)
        ) : count === 0 ? (
          <EmptyState
            glyph="📨"
            title="No grievances"
            message={filter === "all" ? "Nothing filed yet." : `No ${STATUS_LABEL[filter].toLowerCase()} grievances.`}
          />
        ) : (
          rows!.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{g.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                  </div>
                  {g.description ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{g.description}</p>
                  ) : null}
                  {g.citizenName || g.citizenPhone || g.location ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {g.citizenName ? (
                        <>
                          Citizen <span className="font-semibold text-slate-700">{g.citizenName}</span>
                        </>
                      ) : null}
                      {g.citizenPhone ? <> · {g.citizenPhone}</> : null}
                      {g.location ? <> · 📍 {g.location}</> : null}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>
                      Filed by <span className="font-semibold text-slate-600">{g.filedByName}</span>
                    </span>
                    {g.boothName ? (
                      <span>
                        Booth <span className="font-semibold text-slate-600">{g.boothName}</span>
                      </span>
                    ) : null}
                    <span>{formatDate(g.createdAt)}</span>
                  </div>
                </div>
                <label className="flex shrink-0 flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Set status
                  </span>
                  <select
                    value={g.status}
                    onChange={(e) => changeStatus(g, e.target.value as GrievanceStatus)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
                  >
                    {GRIEVANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
        active
          ? "bg-navy text-white shadow-sm"
          : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

/* ================================================================== */
/* Events manager — GET /events + POST /events                        */
/* ================================================================== */

function EventsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await api<EventItem[]>("/events"));
    } catch (e) {
      setEvents([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = events === null;
  const count = events?.length ?? 0;

  return (
    <div className="space-y-8">
      <CreateEvent
        create={(body) => api<EventItem>("/events", { method: "POST", body: JSON.stringify(body) })}
        onCreated={async () => {
          await load();
          toast("Event created.", "success");
        }}
        onError={(m) => toast(m, "error")}
      />

      <section>
        <SectionHeader title="Events" count={loading ? undefined : count} />
        <div className="space-y-3">
          {loading ? (
            [0, 1, 2].map((i) => <SkeletonRow key={i} />)
          ) : count === 0 ? (
            <EmptyState glyph="📅" title="No events yet" message="Create your first event above." />
          ) : (
            events!.map((ev) => <EventCard key={ev.id} ev={ev} onCopy={(m) => toast(m, "info")} />)
          )}
        </div>
      </section>
    </div>
  );
}

function EventCard({ ev, onCopy }: { ev: EventItem; onCopy: (m: string) => void }) {
  function copyToken() {
    // navigator.clipboard may be unavailable on insecure origins; degrade gracefully.
    try {
      void navigator.clipboard?.writeText(ev.qrToken);
      onCopy("Check-in token copied.");
    } catch {
      onCopy(`Token: ${ev.qrToken}`);
    }
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-slate-900">{ev.title}</div>
          <div className="mt-0.5 text-sm text-slate-500">{formatDateTime(ev.startsAt)}</div>
          {ev.location ? <div className="mt-0.5 text-sm text-slate-500">📍 {ev.location}</div> : null}
          {ev.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{ev.description}</p>
          ) : null}
        </div>
        <button
          onClick={copyToken}
          title="Workers enter this token to check in"
          className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left transition hover:border-saffron"
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Check-in token</div>
          <div className="font-mono text-sm font-bold text-navy">{ev.qrToken}</div>
        </button>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CreateEvent({
  create,
  onCreated,
  onError,
}: {
  create: (body: unknown) => Promise<EventItem>;
  onCreated: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(""); // datetime-local value
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title || !when) return;
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) {
      onError("Please pick a valid date and time.");
      return;
    }
    setBusy(true);
    try {
      await create({
        title,
        startsAt: d.toISOString(), // datetime-local -> ISO-8601 with offset
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
      });
      setTitle("");
      setWhen("");
      setLocation("");
      setDescription("");
      await onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Create event</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 sm:col-span-2"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <textarea
          className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 sm:col-span-2"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !title || !when}
          className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create event"}
        </button>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Broadcast & Insights — announcements, content perf, scheduling     */
/* ================================================================== */

interface Announcement {
  id: string;
  title: string;
  body: string;
  targetOrgUnitId: string | null;
  createdAt: string;
}

interface ContentPerformanceRow {
  creativeId: string;
  title: string;
  type: string;
  shares: number;
  reach: number;
  renders: number;
}

interface TopAmplifier {
  userId: string;
  name: string;
  tier: string;
  reach: number;
  shares: number;
}

interface ScheduledCreative {
  id: string;
  title: string;
  scheduledAt: string;
  mcmcCertified: boolean;
}

function BroadcastSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [org, setOrg] = useState<OrgUnitNode[] | null>(null);

  // Org tree powers both the composer audience picker and label resolution.
  const loadOrg = useCallback(async () => {
    try {
      setOrg(await api<OrgUnitNode[]>("/org/tree"));
    } catch {
      setOrg([]);
    }
  }, [api]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  // Resolve a target unit id to a readable name; null/unknown → "All workers".
  const resolveAudience = useCallback(
    (targetOrgUnitId: string | null): string => {
      if (!targetOrgUnitId) return "All workers";
      const unit = org?.find((u) => u.id === targetOrgUnitId);
      return unit ? `${unit.name} · ${ORG_TYPE_LABEL[unit.type]}` : "All workers";
    },
    [org],
  );

  return (
    <div className="space-y-8">
      <AnnouncementsCard
        org={org}
        resolveAudience={resolveAudience}
        create={(body) =>
          api<Announcement>("/announcements", { method: "POST", body: JSON.stringify(body) })
        }
        list={() => api<Announcement[]>("/announcements")}
        onError={(m) => toast(m, "error")}
        onSent={() => toast("Announcement sent.", "success")}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        <ContentPerformanceCard
          loadPerformance={() => api<ContentPerformanceRow[]>("/admin/content-performance")}
          loadAmplifiers={() => api<TopAmplifier[]>("/admin/top-amplifiers")}
          onError={(m) => toast(m, "error")}
        />
        <SchedulingCard
          list={() => api<ScheduledCreative[]>("/admin/scheduled")}
          cancel={(id) => api(`/creatives/${id}/schedule`, { method: "DELETE" })}
          onError={(m) => toast(m, "error")}
          onCancelled={(title) => toast(`Cancelled schedule for “${title}”.`, "success")}
        />
      </div>
    </div>
  );
}

/** Card 1 — compose an announcement + list recent broadcasts. */
function AnnouncementsCard({
  org,
  resolveAudience,
  create,
  list,
  onError,
  onSent,
}: {
  org: OrgUnitNode[] | null;
  resolveAudience: (targetOrgUnitId: string | null) => string;
  create: (body: unknown) => Promise<Announcement>;
  list: () => Promise<Announcement[]>;
  onError: (m: string) => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // "" = All workers (org-wide); otherwise an org unit id.
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Announcement[] | null>(null);

  const orgLoading = org === null;

  const refresh = useCallback(async () => {
    try {
      setItems(await list());
    } catch (e) {
      setItems([]);
      onError((e as Error).message);
    }
  }, [list, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !busy;

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await create({
        title: title.trim(),
        body: body.trim(),
        // Specific subtree → send the id; "All workers" → omit (whole org).
        ...(targetOrgUnitId ? { targetOrgUnitId } : {}),
      });
      setTitle("");
      setBody("");
      setTargetOrgUnitId("");
      onSent();
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loading = items === null;
  const count = items?.length ?? 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">Announcements</h2>
      <div className="space-y-3">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="Announcement title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="min-h-[88px] w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="Write your message to workers…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Audience
          </span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30 disabled:opacity-60"
            value={targetOrgUnitId}
            onChange={(e) => setTargetOrgUnitId(e.target.value)}
            disabled={orgLoading}
          >
            <option value="">All workers (org-wide)</option>
            {(org ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ORG_TYPE_LABEL[u.type]}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            {orgLoading
              ? "Loading org tree…"
              : (org?.length ?? 0) === 0
                ? "Org tree unavailable — sending to all workers."
                : "Broadcast to everyone, or scope to one part of the org tree."}
          </span>
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-saffron px-5 py-2 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send announcement"}
        </button>
      </div>

      {/* Recent announcements */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <SectionHeader title="Recent announcements" count={loading ? undefined : count} />
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : count === 0 ? (
          <EmptyState glyph="📣" title="No announcements yet" message="Send your first broadcast above." />
        ) : (
          <div className="space-y-3">
            {items!.map((a) => {
              const orgWide = !a.targetOrgUnitId;
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-bold text-slate-900">{a.title}</div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(a.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                        orgWide ? "bg-navy/10 text-navy" : "bg-saffron/15 text-saffron"
                      }`}
                    >
                      <span aria-hidden>{orgWide ? "🌐" : "🎯"}</span>
                      {resolveAudience(a.targetOrgUnitId)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** Card 2 — content performance table + top amplifiers mini-list. */
function ContentPerformanceCard({
  loadPerformance,
  loadAmplifiers,
  onError,
}: {
  loadPerformance: () => Promise<ContentPerformanceRow[]>;
  loadAmplifiers: () => Promise<TopAmplifier[]>;
  onError: (m: string) => void;
}) {
  const [rows, setRows] = useState<ContentPerformanceRow[] | null>(null);
  const [amplifiers, setAmplifiers] = useState<TopAmplifier[] | null>(null);

  const load = useCallback(async () => {
    const [perf, amps] = await Promise.allSettled([loadPerformance(), loadAmplifiers()]);
    if (perf.status === "fulfilled") setRows(perf.value);
    else {
      setRows([]);
      onError((perf.reason as Error).message);
    }
    if (amps.status === "fulfilled") setAmplifiers(amps.value);
    else setAmplifiers([]);
  }, [loadPerformance, loadAmplifiers, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsLoading = rows === null;
  const rowCount = rows?.length ?? 0;
  const ampsLoading = amplifiers === null;
  const ampCount = amplifiers?.length ?? 0;

  return (
    <section className="lg:col-span-2">
      <SectionHeader title="Content performance" count={rowsLoading ? undefined : rowCount} />
      {rowsLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : rowCount === 0 ? (
        <EmptyState glyph="📊" title="No performance data" message="Published creatives appear here once shared." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Shares</th>
                <th className="px-4 py-3 text-right">Reach</th>
                <th className="px-4 py-3 text-right">Renders</th>
              </tr>
            </thead>
            <tbody>
              {rows!.map((r) => (
                <tr key={r.creativeId} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 font-bold text-slate-900">{r.title}</td>
                  <td className="px-4 py-3 capitalize text-slate-500">{r.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {r.shares.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-navy">
                    {r.reach.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {r.renders.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top amplifiers mini-list */}
      <div className="mt-6">
        <SectionHeader title="Top amplifiers" count={ampsLoading ? undefined : ampCount} />
        {ampsLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : ampCount === 0 ? (
          <EmptyState glyph="🚀" title="No amplifiers yet" message="Workers who drive reach appear here." />
        ) : (
          <div className="space-y-2">
            {amplifiers!.map((a, i) => (
              <div
                key={a.userId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold ${
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
                    <div className="truncate font-bold text-slate-900">{a.name}</div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {TIER_LABEL[a.tier] ?? a.tier}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-navy">{a.reach.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">reach</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Card 3 — scheduled creatives with cancel controls. */
function SchedulingCard({
  list,
  cancel,
  onError,
  onCancelled,
}: {
  list: () => Promise<ScheduledCreative[]>;
  cancel: (id: string) => Promise<unknown>;
  onError: (m: string) => void;
  onCancelled: (title: string) => void;
}) {
  const [items, setItems] = useState<ScheduledCreative[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await list());
    } catch (e) {
      setItems([]);
      onError((e as Error).message);
    }
  }, [list, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCancel(item: ScheduledCreative) {
    setBusyId(item.id);
    try {
      await cancel(item.id);
      onCancelled(item.title);
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const loading = items === null;
  const count = items?.length ?? 0;

  return (
    <section>
      <SectionHeader title="Scheduled" count={loading ? undefined : count} />
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : count === 0 ? (
        <EmptyState glyph="⏰" title="Nothing scheduled" message="Scheduled creatives appear here." />
      ) : (
        <div className="space-y-3">
          {items!.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">{s.title}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{formatDateTime(s.scheduledAt)}</div>
                </div>
                <Badge ok={s.mcmcCertified} okText="MCMC ✓" noText="Uncertified" />
              </div>
              <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                <button
                  onClick={() => onCancel(s)}
                  disabled={busyId === s.id}
                  className="rounded-md bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700 transition hover:bg-rose-200 disabled:opacity-50"
                >
                  {busyId === s.id ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
