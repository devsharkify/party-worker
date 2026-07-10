"use client";
import { useCallback, useContext, useEffect, useMemo, useState, createContext } from "react";
import type {
  AdminGrievanceRow,
  AdminStats,
  AdminUserRow,
  CreativeType,
  EventItem,
  GrievanceStatus,
  NewsItem,
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
import { TemplateDesigner } from "../src/template-designer";
import { AnalyticsSection } from "../src/analytics-section";
import { SubmissionsSection } from "../src/submissions-section";
import { TRSLogo } from "../src/TRSLogo";
import { BulkImport } from "../src/bulk-import";
import { VotersSection } from "../src/voters-section";
import { BoothHealthSection } from "../src/booth-health-section";

/* ------------------------------------------------------------------ */
/* Admin language context (te / en toggle)                            */
/* ------------------------------------------------------------------ */
type AdminLang = "en" | "te";
const AdminLangCtx = createContext<{ lang: AdminLang; toggle: () => void }>({
  lang: "en",
  toggle: () => undefined,
});
function useAdminLang() { return useContext(AdminLangCtx); }

const NAV_LABELS: Record<string, { en: string; te: string }> = {
  overview:       { en: "Overview",              te: "అవలోకనం" },
  people:         { en: "People",                te: "సభ్యులు" },
  studio:         { en: "Studio",                te: "స్టూడియో" },
  submissions:    { en: "Submissions",           te: "సమర్పణలు" },
  templates:      { en: "Templates",             te: "టెంప్లేట్లు" },
  organization:   { en: "Organization",          te: "సంఘటన" },
  news:           { en: "News",                  te: "వార్తలు" },
  grievances:     { en: "Grievances",            te: "ఫిర్యాదులు" },
  events:         { en: "Events",                te: "ఈవెంట్లు" },
  missions:       { en: "Trend Missions",        te: "ట్రెండ్ మిషన్లు" },
  broadcast:      { en: "Broadcast & Insights",  te: "ప్రసారం & విశ్లేషణ" },
  analytics:      { en: "Analytics",             te: "విశ్లేషణలు" },
  polls:          { en: "Polls",                  te: "పోల్లు" },
  crisis:         { en: "Crisis",                 te: "క్రైసిస్" },
  opposition:     { en: "Opposition",             te: "ప్రతిపక్షం" },
  boothtasks:     { en: "Booth Tasks",            te: "బూత్ టాస్క్లు" },
  wagroups:       { en: "WA Groups",              te: "WA గ్రూపులు" },
  canvassing:     { en: "Canvassing",             te: "క్యాన్వాసింగ్" },
  voters:         { en: "Voters",                 te: "ఓటర్లు" },
  boothhealth:    { en: "Booth Health",            te: "బూత్ హెల్త్" },
};

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
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(undefined);
    setBusy(true);
    try {
      await requestOtp(phone);
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
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-navy to-navydark p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mx-auto mb-3 flex items-center justify-center" style={{filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.22))"}}>
          <TRSLogo size={72} showBanner borderRadius={8} />
        </div>
        <h1 className="text-center text-2xl font-extrabold">myTRS — HQ</h1>
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

type Section =
  | "overview"
  | "people"
  | "studio"
  | "submissions"
  | "templates"
  | "organization"
  | "news"
  | "grievances"
  | "events"
  | "missions"
  | "broadcast"
  | "analytics"
  | "polls"
  | "crisis"
  | "opposition"
  | "boothtasks"
  | "wagroups"
  | "canvassing"
  | "voters"
  | "boothhealth";

const NAV: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "studio", label: "Studio" },
  { id: "submissions", label: "Submissions" },
  { id: "templates", label: "Templates" },
  { id: "organization", label: "Organization" },
  { id: "news", label: "News" },
  { id: "grievances", label: "Grievances" },
  { id: "events", label: "Events" },
  { id: "missions", label: "Trend Missions" },
  { id: "broadcast", label: "Broadcast & Insights" },
  { id: "analytics", label: "Analytics" },
  { id: "polls", label: "Polls" },
  { id: "crisis", label: "Crisis" },
  { id: "opposition", label: "Opposition" },
  { id: "boothtasks", label: "Booth Tasks" },
  { id: "wagroups", label: "WA Groups" },
  { id: "canvassing", label: "Canvassing" },
  { id: "voters", label: "Voters" },
  { id: "boothhealth", label: "Booth Health" },
];

function Dashboard() {
  const { user, logout } = useAdmin();
  const [section, setSection] = useState<Section>("overview");
  const [lang, setLang] = useState<AdminLang>("en");
  const langCtx = useMemo(() => ({ lang, toggle: () => setLang((l) => (l === "en" ? "te" : "en")) }), [lang]);

  return (
    <AdminLangCtx.Provider value={langCtx}>
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pt-4">
          <div className="flex items-baseline gap-3">
            <div className="flex items-center gap-2.5">
              <TRSLogo size={32} showBanner={false} borderRadius={4} />
              <span className="text-lg font-extrabold">myTRS HQ</span>
            </div>
            <span className="hidden text-sm text-slate-300 sm:inline">Content Studio &amp; Compliance</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{user?.name}</span>
            <button
              onClick={langCtx.toggle}
              title="Toggle language"
              className="rounded-md bg-white/10 px-3 py-1.5 font-semibold transition hover:bg-white/20"
            >
              {lang === "en" ? "తెలుగు" : "English"}
            </button>
            <button
              onClick={logout}
              className="rounded-md bg-white/10 px-3 py-1.5 font-semibold transition hover:bg-white/20"
            >
              {lang === "en" ? "Log out" : "లాగ్ అవుట్"}
            </button>
          </div>
        </div>
        {/* Segmented section nav (no routing — local state) */}
        <nav className="mx-auto max-w-6xl px-6">
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1.5" role="tablist" aria-label="Sections">
            {NAV.map((n) => {
              const active = section === n.id;
              const label = NAV_LABELS[n.id]?.[lang] ?? n.label;
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
                  {label}
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
        {section === "people" ? <PeopleSection /> : null}
        {section === "studio" ? <StudioSection /> : null}
        {section === "submissions" ? <SubmissionsSection /> : null}
        {section === "templates" ? <TemplateDesigner /> : null}
        {section === "organization" ? <OrganizationSection /> : null}
        {section === "news" ? <NewsSection /> : null}
        {section === "grievances" ? <GrievancesSection /> : null}
        {section === "events" ? <EventsSection /> : null}
        {section === "missions" ? <MissionsSection /> : null}
        {section === "broadcast" ? <BroadcastSection /> : null}
        {section === "analytics" ? <AnalyticsSection /> : null}
        {section === "polls" ? <PollsSection /> : null}
        {section === "crisis" ? <CrisisSection /> : null}
        {section === "opposition" ? <OppositionSection /> : null}
        {section === "boothtasks" ? <BoothTasksSection /> : null}
        {section === "wagroups" ? <WaGroupsSection /> : null}
        {section === "canvassing" ? <CanvassingSection /> : null}
        {section === "voters" ? <VotersSection /> : null}
        {section === "boothhealth" ? <BoothHealthSection /> : null}
      </main>
    </div>
    </AdminLangCtx.Provider>
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
  publishedAt: string | null;
  mcmcCertified: boolean;
  aiLabeled: boolean;
  mcmcCertId: string | null;
  videoDurationSec: number | null;
  /** Org subtree this creative is published to; null = whole org (all workers). */
  targetOrgUnitId: string | null;
  /** Public URL of the source media file, used for social publishing. */
  sourceUrl?: string;
  /** Storage key for thumbnail derivation. */
  sourceKey?: string;
  createdAt?: string;
  isBreaking: boolean;
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
                    toast(`Certified "${c.title}" (${certId}).`, "success");
                    await loadCreatives();
                  }}
                  onPublish={async () => {
                    try {
                      await api(`/creatives/${c.id}/publish`, { method: "POST" });
                      toast(`Published "${c.title}" — now in the worker feed.`, "success");
                      await loadCreatives();
                    } catch (e) {
                      toast(`Publish blocked: ${(e as Error).message}`, "error");
                    }
                  }}
                  onUnpublish={async () => {
                    try {
                      await api(`/creatives/${c.id}/unpublish`, { method: "PATCH" });
                      toast(`"${c.title}" moved back to draft.`, "success");
                      await loadCreatives();
                    } catch (e) {
                      toast(`Unpublish failed: ${(e as Error).message}`, "error");
                    }
                  }}
                  onToggleBreaking={async (isBreaking) => {
                    await api(`/creatives/${c.id}/breaking`, {
                      method: "PATCH",
                      body: JSON.stringify({ isBreaking }),
                    });
                    toast(
                      isBreaking
                        ? `"${c.title}" marked as BREAKING — push-to-all on publish.`
                        : `"${c.title}" breaking flag removed.`,
                      "success",
                    );
                    await loadCreatives();
                  }}
                  onDelete={async () => {
                    if (!confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
                    try {
                      await api(`/creatives/${c.id}`, { method: "DELETE" });
                      toast(`Deleted "${c.title}".`, "success");
                      await loadCreatives();
                    } catch (e) {
                      toast(`Delete failed: ${(e as Error).message}`, "error");
                    }
                  }}
                  onPostInstagram={async () => {
                    await api("/social/instagram/publish", {
                      method: "POST",
                      body: JSON.stringify({ creativeId: c.id, kind: "feed" }),
                    });
                  }}
                  onSchedule={async (scheduledAt) => {
                    try {
                      await api(`/creatives/${c.id}/schedule`, {
                        method: "POST",
                        body: JSON.stringify({ scheduledAt }),
                      });
                      toast(`"${c.title}" scheduled.`, "success");
                    } catch (e) {
                      toast(`Schedule failed: ${(e as Error).message}`, "error");
                      throw e;
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
  const [videoDurationSec, setVideoDurationSec] = useState<string>("");
  // "" = All workers (org-wide); otherwise an org unit id.
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [mcmcCertified, setMcmcCertified] = useState(false);
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
        ...(targetOrgUnitId ? { targetOrgUnitId } : {}),
        ...(type === "video" && videoDurationSec ? { videoDurationSec: parseInt(videoDurationSec, 10) } : {}),
        ...(mcmcCertified ? { mcmcCertified: true } : {}),
      });
      setTitle("");
      setTe("");
      setEn("");
      setFile(null);
      setVideoDurationSec("");
      setTargetOrgUnitId("");
      setMcmcCertified(false);
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
      <div className="mt-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mcmcCertified}
            onChange={(e) => setMcmcCertified(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-saffron"
          />
          <span className="text-sm font-semibold text-slate-700">MCMC certified</span>
          <span className="text-xs text-slate-400">(mark if this creative already carries MCMC compliance)</span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept={type === "video" ? "video/*,image/*" : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700"
            />
            {type === "video" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Duration (sec)</label>
                <input
                  type="number"
                  min={1}
                  max={3600}
                  placeholder="e.g. 30"
                  value={videoDurationSec}
                  onChange={(e) => setVideoDurationSec(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
                />
              </div>
            )}
          </div>
          {file && (
            <p className="text-xs text-slate-400 truncate">
              {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
        </div>
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
  onUnpublish,
  onDelete,
  onPostInstagram,
  onSchedule,
  onToggleBreaking,
}: {
  c: CreativeRow;
  org: OrgUnitNode[] | null;
  onCertify: (certId: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPostInstagram: () => Promise<void>;
  onSchedule: (scheduledAt: string) => Promise<void>;
  onToggleBreaking: (isBreaking: boolean) => Promise<void>;
}) {
  const [certId, setCertId] = useState("MCMC/TG/2026/");
  const [busy, setBusy] = useState(false);
  const [igStatus, setIgStatus] = useState<"idle" | "posting" | "posted" | "failed">("idle");
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);

  // Resolve the target unit from the cached org tree; fall back to the raw id.
  const audience = (() => {
    if (!c.targetOrgUnitId) return "All workers";
    const unit = org?.find((u) => u.id === c.targetOrgUnitId);
    return unit ? `${unit.name} · ${unit.type}` : c.targetOrgUnitId;
  })();
  const orgWide = !c.targetOrgUnitId;

  // Derive a thumbnail URL from sourceUrl (prefer that, else null).
  const thumbUrl = c.sourceUrl ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md overflow-hidden">
      <div className="flex gap-0">
        {/* Thumbnail column */}
        {thumbUrl ? (
          <div className="relative shrink-0 w-24 bg-slate-100">
            {c.type === "video" ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-200 text-2xl min-h-[80px]">
                🎬
              </div>
            ) : (
              <img
                src={thumbUrl}
                alt={c.title}
                className="h-full w-full object-cover min-h-[80px]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {c.published && (
              <span className="absolute top-1 left-1 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                LIVE
              </span>
            )}
            {c.isBreaking && (
              <span className="absolute bottom-1 left-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                🚨 BREAKING
              </span>
            )}
          </div>
        ) : (
          <div className="shrink-0 w-24 bg-slate-100 flex items-center justify-center text-2xl min-h-[80px] text-slate-300">
            {c.type === "video" ? "🎬" : c.type === "carousel" ? "🖼" : "📷"}
          </div>
        )}

        {/* Content column */}
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">{c.title}</div>
              <div className="flex items-center gap-2 text-sm capitalize text-slate-500 mt-0.5">
                {c.type === "video" ? <span>🎬</span> : c.type === "carousel" ? <span>🖼</span> : <span>📷</span>}
                {c.type}
                {c.videoDurationSec != null && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                    {Math.floor(c.videoDurationSec / 60)}:{String(c.videoDurationSec % 60).padStart(2, "0")}
                  </span>
                )}
                {c.publishedAt && (
                  <span className="text-xs text-slate-400">
                    Published {formatDate(c.publishedAt)}
                  </span>
                )}
                {!c.publishedAt && c.createdAt && (
                  <span className="text-xs text-slate-400">
                    Draft since {formatDate(c.createdAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 shrink-0">
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
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {!c.published ? (
              <>
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
                  {busy ? "Publishing…" : "Publish"}
                </button>
                {scheduledLabel ? (
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                    🗓 Scheduled for {scheduledLabel}
                  </span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => setShowScheduleForm((v) => !v)}
                    className="rounded-md bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                  >
                    🗓 Schedule
                  </button>
                )}
                {showScheduleForm && !scheduledLabel ? (
                  <div className="mt-2 flex w-full flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="rounded-md border border-indigo-300 px-2 py-1 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      disabled={busy || !scheduledAt}
                      onClick={async () => {
                        if (!scheduledAt) return;
                        setBusy(true);
                        try {
                          await onSchedule(new Date(scheduledAt).toISOString());
                          setScheduledLabel(
                            new Date(scheduledAt).toLocaleString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                          );
                          setShowScheduleForm(false);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowScheduleForm(false)}
                      className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onUnpublish();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-md bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
              >
                {busy ? "Unpublishing…" : "Unpublish"}
              </button>
            )}
            <button
              disabled={igStatus === "posting" || igStatus === "posted"}
              onClick={async () => {
                setIgStatus("posting");
                try {
                  await onPostInstagram();
                  setIgStatus("posted");
                } catch {
                  setIgStatus("failed");
                }
              }}
              className={`rounded-md px-3 py-1 text-sm font-bold transition disabled:opacity-50 ${
                igStatus === "posted"
                  ? "bg-green-100 text-green-700"
                  : igStatus === "failed"
                    ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                    : "bg-pink-100 text-pink-700 hover:bg-pink-200"
              }`}
            >
              {igStatus === "posting"
                ? "Posting…"
                : igStatus === "posted"
                  ? "✓ Posted"
                  : igStatus === "failed"
                    ? "✗ Failed"
                    : "📤 Instagram"}
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onToggleBreaking(!c.isBreaking);
                } finally {
                  setBusy(false);
                }
              }}
              className={`rounded-md px-3 py-1 text-sm font-bold transition disabled:opacity-50 ${
                c.isBreaking
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              {c.isBreaking ? "🚨 Breaking ON" : "🚨 Mark Breaking"}
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                }
              }}
              className="ml-auto rounded-md bg-rose-50 px-3 py-1 text-sm font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
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
const ROLE_LABEL: Record<string, string> = {
  worker: "Worker",
  booth_leader: "Booth Leader",
  mandal_leader: "Mandal Leader / Ward Leader",
  constituency_leader: "Constituency Leader",
  district_leader: "District Leader",
  state_admin: "State Admin",
  hq_admin: "HQ Admin",
};

/** Leader roles that can be promoted to via the quick-promote menu. */
const PROMOTE_ROLES: Role[] = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
];

/** Badge colour for each leader role pill. */
const ROLE_BADGE_CLASS: Record<string, string> = {
  booth_leader: "bg-amber-100 text-amber-700",
  mandal_leader: "bg-orange-100 text-orange-700",
  constituency_leader: "bg-purple-100 text-purple-700",
  district_leader: "bg-blue-100 text-blue-700",
  state_admin: "bg-red-100 text-red-700",
  hq_admin: "bg-navy/15 text-navy",
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

      <BulkImport />

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
            toast(`Created ${ORG_TYPE_LABEL[unit.type]} "${unit.name}".`, "success");
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
      toast(`"${row.title}" → ${STATUS_LABEL[next]}.`, "success");
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
  const [units, setUnits] = useState<OrgUnitNode[]>([]);
  const [editing, setEditing] = useState<EventItem | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await api<EventItem[]>("/events"));
    } catch (e) {
      setEvents([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api<OrgUnitNode[]>("/org/tree").then(setUnits).catch(() => {});
  }, [api]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try {
      await api<void>(`/events/${id}`, { method: "DELETE" });
      toast("Event deleted.", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function handleUpdate(id: string, dto: Record<string, unknown>) {
    await api<EventItem>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
    setEditing(null);
    toast("Event updated.", "success");
    await load();
  }

  const loading = events === null;
  const count = events?.length ?? 0;

  return (
    <div className="space-y-8">
      <CreateEvent
        units={units}
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
            events!.map((ev) => (
              <EventCard
                key={ev.id}
                ev={ev}
                units={units}
                onCopy={(m) => toast(m, "info")}
                onEdit={() => setEditing(ev)}
                onDelete={() => handleDelete(ev.id)}
              />
            ))
          )}
        </div>
      </section>

      {editing ? (
        <EditEventModal
          ev={editing}
          units={units}
          onSave={(dto) => handleUpdate(editing.id, dto)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EventCard({
  ev,
  units,
  onCopy,
  onEdit,
  onDelete,
}: {
  ev: EventItem;
  units: OrgUnitNode[];
  onCopy: (m: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  function copyToken() {
    // navigator.clipboard may be unavailable on insecure origins; degrade gracefully.
    try {
      void navigator.clipboard?.writeText(ev.qrToken);
      onCopy("Check-in token copied.");
    } catch {
      onCopy(`Token: ${ev.qrToken}`);
    }
  }
  const unitName = units.find((u) => u.id === ev.orgUnitId)?.name;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900">{ev.title}</div>
          <div className="mt-0.5 text-sm text-slate-500">{formatDateTime(ev.startsAt)}</div>
          {ev.location ? <div className="mt-0.5 text-sm text-slate-500">📍 {ev.location}</div> : null}
          {ev.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{ev.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {unitName ? (
              <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">{unitName}</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">All workers</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            onClick={copyToken}
            title="Workers enter this token to check in"
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left transition hover:border-saffron"
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Check-in token</div>
            <div className="font-mono text-sm font-bold text-navy">{ev.qrToken}</div>
          </button>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:border-navy hover:text-navy"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditEventModal({
  ev,
  units,
  onSave,
  onClose,
}: {
  ev: EventItem;
  units: OrgUnitNode[];
  onSave: (dto: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(ev.title);
  const [when, setWhen] = useState(() => {
    const d = new Date(ev.startsAt);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [location, setLocation] = useState(ev.location ?? "");
  const [description, setDescription] = useState(ev.description ?? "");
  const [orgUnitId, setOrgUnitId] = useState(ev.orgUnitId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit() {
    if (!title.trim() || !when) return;
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) {
      setErr("Please pick a valid date and time.");
      return;
    }
    setBusy(true);
    setErr(undefined);
    try {
      await onSave({
        title: title.trim(),
        startsAt: d.toISOString(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        orgUnitId: orgUnitId || undefined,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-extrabold text-slate-900">Edit event</h2>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Title *</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date &amp; time *</span>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              placeholder="Optional"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Description</span>
            <textarea
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              rows={3}
              placeholder="Optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Target org unit</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
            >
              <option value="">All workers</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {ORG_TYPE_LABEL[u.type]}</option>
              ))}
            </select>
          </label>
          {err ? <p className="text-sm font-semibold text-red-600">{err}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim() || !when}
            className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
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
  units,
  create,
  onCreated,
  onError,
}: {
  units: OrgUnitNode[];
  create: (body: unknown) => Promise<EventItem>;
  onCreated: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
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
        startsAt: d.toISOString(),
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
        ...(orgUnitId ? { orgUnitId } : {}),
      });
      setTitle("");
      setWhen("");
      setLocation("");
      setDescription("");
      setOrgUnitId("");
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
          placeholder="Event title *"
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
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Target org unit (all if blank)</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
          >
            <option value="">All workers</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {ORG_TYPE_LABEL[u.type]}</option>
            ))}
          </select>
        </label>
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
          onCancelled={(title) => toast(`Cancelled schedule for "${title}".`, "success")}
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

/* ================================================================== */
/* People — full user management (list, role change, unit reassign)   */
/* ================================================================== */

function PeopleSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [units, setUnits] = useState<OrgUnitNode[]>([]);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      if (roleFilter !== "all") qs.set("role", roleFilter);
      setUsers(await api<AdminUserRow[]>(`/admin/users?${qs}`));
    } catch (e) {
      setUsers([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast, search, roleFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api<OrgUnitNode[]>("/admin/org-units").then(setUnits).catch(() => {
      // fall back to /org/tree if the admin endpoint is unavailable
      api<OrgUnitNode[]>("/org/tree").then(setUnits).catch(() => {});
    });
  }, [api]);

  async function saveEdit(dto: { role?: Role; orgUnitId?: string; name?: string; designation?: string | null }) {
    if (!editing) return;
    try {
      const updated = await api<AdminUserRow>(`/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(dto),
      });
      setUsers((cur) => cur ? cur.map((u) => u.id === updated.id ? updated : u) : cur);
      toast(`${updated.name} updated.`, "success");
      setEditing(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  /** One-click role change without opening the full edit modal. */
  async function quickSetRole(user: AdminUserRow, role: Role) {
    if (busyId) return;
    setBusyId(user.id);
    try {
      const updated = await api<AdminUserRow>(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setUsers((cur) => cur ? cur.map((u) => u.id === updated.id ? updated : u) : cur);
      const label = ROLE_LABEL[role] ?? role;
      toast(
        role === "worker"
          ? `${updated.name} demoted to Worker.`
          : `${updated.name} appointed as ${label}.`,
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  const ROLE_OPTS: Role[] = ["worker", "booth_leader", "mandal_leader", "constituency_leader", "district_leader", "state_admin", "hq_admin"];

  const loading = users === null;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
        >
          <option value="all">All roles</option>
          {ROLE_OPTS.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <button
          onClick={load}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
        >
          Search
        </button>
      </div>

      <SectionHeader title="All members" count={loading ? undefined : (users?.length ?? 0)} />

      {/* Edit modal */}
      {editing ? (
        <EditUserModal
          user={editing}
          units={units}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <div className="space-y-2">
        {loading ? (
          [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)
        ) : (users?.length ?? 0) === 0 ? (
          <EmptyState glyph="👥" title="No members found" message="Try a different search or filter." />
        ) : (
          users!.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`h-8 w-8 shrink-0 rounded-full text-sm font-extrabold text-white flex items-center justify-center ${u.isLeader ? "bg-saffron" : "bg-navy/60"}`}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{u.name}</span>
                    {/* Role badge — distinct colour per leader role */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        u.isLeader
                          ? (ROLE_BADGE_CLASS[u.role] ?? "bg-saffron/15 text-amber-700")
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {u.phone} · {u.orgUnitName} ({u.orgUnitType})
                    {u.designation ? ` · ${u.designation}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="text-right text-xs hidden sm:block">
                  <div className="font-extrabold text-navy">{u.weeklyLeaguePoints.toLocaleString()} <span className="font-normal text-slate-400">wk</span></div>
                  <div className="text-slate-400">{u.lifetimeReputation.toLocaleString()} lifetime</div>
                </div>

                {/* Quick promote dropdown — only shown for non-admin roles */}
                {u.role !== "state_admin" && u.role !== "hq_admin" ? (
                  <div className="relative group">
                    <button
                      disabled={busyId === u.id}
                      className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700 transition hover:border-green-500 hover:bg-green-100 disabled:opacity-50"
                    >
                      {busyId === u.id ? "…" : "↑ Promote"}
                    </button>
                    <div className="absolute right-0 top-full z-20 mt-1 hidden w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-xl group-focus-within:block group-hover:block">
                      {PROMOTE_ROLES.filter((r) => r !== u.role).map((r) => (
                        <button
                          key={r}
                          onClick={() => quickSetRole(u, r)}
                          disabled={busyId === u.id}
                          className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {ROLE_LABEL[r] ?? r}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Quick demote to Worker — only shown if user is a leader (not admin) */}
                {u.isLeader && u.role !== "state_admin" && u.role !== "hq_admin" ? (
                  <button
                    disabled={busyId === u.id}
                    onClick={() => quickSetRole(u, "worker")}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {busyId === u.id ? "…" : "↓ Worker"}
                  </button>
                ) : null}

                <button
                  onClick={() => setEditing(u)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:border-navy hover:text-navy"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  units,
  onSave,
  onClose,
}: {
  user: AdminUserRow;
  units: OrgUnitNode[];
  onSave: (dto: { role?: Role; orgUnitId?: string; name?: string; designation?: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [orgUnitId, setOrgUnitId] = useState(user.orgUnitId);
  const [designation, setDesignation] = useState(user.designation ?? "");
  const [busy, setBusy] = useState(false);

  const ROLE_OPTS: Role[] = ["worker", "booth_leader", "mandal_leader", "constituency_leader", "district_leader", "state_admin", "hq_admin"];

  async function submit() {
    setBusy(true);
    try {
      await onSave({
        name: name.trim() || undefined,
        role,
        orgUnitId: orgUnitId || undefined,
        designation: designation.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-extrabold text-slate-900">Edit {user.name}</h2>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Name</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Role</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLE_OPTS.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            {["booth_leader", "mandal_leader", "constituency_leader", "district_leader"].includes(role) && (
              <p className="text-xs text-amber-600">This role will make the user a leader — a push notification will be sent on save.</p>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Org Unit (Constituency / Booth)</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ORG_TYPE_LABEL[u.type]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Designation (optional)</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              placeholder="e.g. Ward Secretary"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
            />
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Phone: <span className="font-semibold">{user.phone}</span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-navy px-5 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* News — create + list news items shown in worker app               */
/* ================================================================== */

function NewsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [units, setUnits] = useState<OrgUnitNode[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<NewsItem[]>("/admin/news"));
    } catch (e) {
      setItems([]);
      toast((e as Error).message, "error");
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api<OrgUnitNode[]>("/org/tree").then(setUnits).catch(() => {});
  }, [api]);

  async function publish() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await api<NewsItem>("/admin/news", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          imageUrl: imageUrl.trim() || null,
          sourceUrl: sourceUrl.trim() || null,
          orgUnitId: orgUnitId || undefined,
        }),
      });
      setTitle(""); setBody(""); setImageUrl(""); setSourceUrl(""); setOrgUnitId("");
      toast("News published!", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const loading = items === null;

  return (
    <div className="space-y-8">
      {/* Create form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Publish news</h2>
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder="Headline *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
            placeholder="Body text *"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              placeholder="Image URL (optional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              placeholder="Source URL (optional)"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Target (all if blank)</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/30"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
            >
              <option value="">All workers</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {ORG_TYPE_LABEL[u.type]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={publish}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-lg bg-saffron px-5 py-2 font-bold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </section>

      {/* News list */}
      <section>
        <SectionHeader title="Published news" count={loading ? undefined : (items?.length ?? 0)} />
        <div className="space-y-3">
          {loading ? (
            [0, 1].map((i) => <SkeletonRow key={i} />)
          ) : (items?.length ?? 0) === 0 ? (
            <EmptyState glyph="📰" title="No news yet" message="Publish the first news item above." />
          ) : (
            items!.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>{formatDate(item.publishedAt)}</span>
                      {item.orgUnitName ? (
                        <span className="rounded-full bg-navy/10 px-2 py-0.5 font-semibold text-navy">{item.orgUnitName}</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">All workers</span>
                      )}
                      {item.sourceUrl ? (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-saffron hover:underline">Source ↗</a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================
// Missions (Trend Alerts) section
// ============================================================

interface MissionRow {
  id: string;
  title: string;
  caption: string | null;
  hashtag: string | null;
  bonusPoints: number;
  startsAt: string;
  endsAt: string;
  creativeId: string | null;
  completionCount: number;
}

function MissionsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [missions, setMissions] = useState<MissionRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [bonusPoints, setBonusPoints] = useState(10);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMissions(await api<MissionRow[]>("/missions/all"));
    } catch {
      setMissions([]);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!title.trim() || !startsAt || !endsAt) {
      toast("Title, start, and end time are required.", "error");
      return;
    }
    setBusy(true);
    try {
      await api("/missions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          caption: caption.trim() || undefined,
          hashtag: hashtag.trim() || undefined,
          bonusPoints,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          creativeId: creativeId.trim() || undefined,
        }),
      });
      toast("Mission created.", "success");
      setTitle(""); setCaption(""); setHashtag(""); setCreativeId(""); setStartsAt(""); setEndsAt("");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Create Trend Alert Mission" />
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Title *</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                placeholder="e.g. Share the Hyderabad rally poster"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Hashtag</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                placeholder="#MyTRS"
                value={hashtag}
                onChange={(e) => setHashtag(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-bold text-slate-700">Caption (optional)</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                placeholder="Short CTA for workers"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Starts At *</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Ends At *</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Bonus Points</label>
              <input
                type="number"
                min={1}
                max={500}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron"
                value={bonusPoints}
                onChange={(e) => setBonusPoints(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Creative ID (optional)</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron font-mono text-xs"
                placeholder="Link to a specific creative"
                value={creativeId}
                onChange={(e) => setCreativeId(e.target.value)}
              />
            </div>
          </div>
          <button
            disabled={busy}
            onClick={handleCreate}
            className="rounded-md bg-saffron px-6 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create Mission"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeader title="All Missions" count={missions?.length} />
        <div className="space-y-3">
          {missions === null ? (
            [0, 1].map((i) => <SkeletonRow key={i} />)
          ) : missions.length === 0 ? (
            <EmptyState glyph="🎯" title="No missions yet" message="Create a Trend Alert mission above." />
          ) : (
            missions.map((m) => {
              const now = new Date();
              const started = new Date(m.startsAt);
              const ended = new Date(m.endsAt);
              const status =
                now < started ? "Upcoming" : now > ended ? "Ended" : "Active";
              return (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{m.title}</div>
                      {m.caption && <div className="text-sm text-slate-500 mt-0.5">{m.caption}</div>}
                      {m.hashtag && <div className="text-sm font-bold text-saffron mt-0.5">{m.hashtag}</div>}
                      <div className="mt-1 text-xs text-slate-400">
                        {formatDate(m.startsAt)} → {formatDate(m.endsAt)} · {m.completionCount} completions
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        status === "Active" ? "bg-green-100 text-green-700" :
                        status === "Upcoming" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {status}
                      </span>
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">
                        +{m.bonusPoints} pts
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Polls — create + list                                              */
/* ================================================================== */

type PollItem = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  endsAt: string;
  createdAt: string;
  _count: { votes: number };
};

function PollsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [polls, setPolls] = useState<PollItem[] | null>(null);
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("అవును / Yes");
  const [optionB, setOptionB] = useState("కాదు / No");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPolls(await api<PollItem[]>("/polls")); } catch (e) { toast((e as Error).message, "error"); }
  }, [api, toast]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!question.trim() || !endsAt) return;
    setBusy(true);
    try {
      await api("/polls", { method: "POST", body: JSON.stringify({ question, optionA, optionB, endsAt: new Date(endsAt).toISOString() }) });
      toast("Poll created", "success");
      setQuestion(""); setEndsAt("");
      void load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Create Poll" />
        <div className="space-y-3 mt-4">
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Question (Telugu + English)" value={question} onChange={e => setQuestion(e.target.value)} />
          <div className="flex gap-3">
            <input className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Option A" value={optionA} onChange={e => setOptionA(e.target.value)} />
            <input className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Option B" value={optionB} onChange={e => setOptionB(e.target.value)} />
          </div>
          <input type="datetime-local" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
          <button disabled={busy || !question.trim() || !endsAt} onClick={create} className="rounded-md bg-saffron px-6 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-50">
            {busy ? "Creating…" : "Create Poll"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeader title="All Polls" count={polls?.length} />
        <div className="space-y-3">
          {polls === null ? [0,1].map(i => <SkeletonRow key={i} />) : polls.length === 0 ? (
            <EmptyState glyph="📊" title="No polls yet" message="Create one above." />
          ) : polls.map(p => {
            const ended = new Date(p.endsAt) < new Date();
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">{p.question}</div>
                    <div className="mt-1 text-sm text-slate-500">{p.optionA} vs {p.optionB}</div>
                    <div className="mt-2 text-xs text-slate-400">{p._count.votes} votes · ends {formatDate(p.endsAt)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold shrink-0 ${ended ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"}`}>{ended ? "Ended" : "Live"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Crisis — activate / resolve alerts                                 */
/* ================================================================== */

type CrisisAlert = { id: string; title: string; message: string; createdAt: string };

function CrisisSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<CrisisAlert[] | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAlerts(await api<CrisisAlert[]>("/crisis/active")); } catch (e) { toast((e as Error).message, "error"); }
  }, [api, toast]);
  useEffect(() => { void load(); }, [load]);

  async function activate() {
    if (!title.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await api("/crisis", { method: "POST", body: JSON.stringify({ title, message }) });
      toast("Crisis alert activated — push sent to all workers", "success");
      setTitle(""); setMessage("");
      void load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function resolve(id: string) {
    try {
      await api(`/crisis/${id}/resolve`, { method: "PUT" });
      toast("Alert resolved", "success");
      void load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <SectionHeader title="Activate Crisis Alert" />
        <p className="text-sm text-red-600 mb-4 mt-1">Sends push notification to ALL party workers immediately.</p>
        <div className="space-y-3">
          <input className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm outline-none focus:border-red-500" placeholder="Alert title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm outline-none focus:border-red-500 resize-none" rows={3} placeholder="Alert message (bilingual)" value={message} onChange={e => setMessage(e.target.value)} />
          <button disabled={busy || !title.trim() || !message.trim()} onClick={activate} className="rounded-md bg-red-600 px-6 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? "Activating…" : "Activate Crisis Alert"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeader title="Active Alerts" count={alerts?.length} />
        <div className="space-y-3">
          {alerts === null ? [0,1].map(i => <SkeletonRow key={i} />) : alerts.length === 0 ? (
            <EmptyState glyph="✅" title="No active alerts" message="No crisis alerts currently active." />
          ) : alerts.map(a => (
            <div key={a.id} className="rounded-xl border border-red-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-red-700">🚨 {a.title}</div>
                <div className="text-sm text-slate-600 mt-1">{a.message}</div>
                <div className="text-xs text-slate-400 mt-2">{formatDate(a.createdAt)}</div>
              </div>
              <button onClick={() => resolve(a.id)} className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Resolve</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Opposition tracker                                                  */
/* ================================================================== */

type OppositionItem = { id: string; party: string; headline: string; details: string | null; trsResponse: string | null; createdAt: string };

function OppositionSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [items, setItems] = useState<OppositionItem[] | null>(null);
  const [party, setParty] = useState("");
  const [headline, setHeadline] = useState("");
  const [details, setDetails] = useState("");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api<OppositionItem[]>("/opposition")); } catch (e) { toast((e as Error).message, "error"); }
  }, [api, toast]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!party.trim() || !headline.trim()) return;
    setBusy(true);
    try {
      await api("/opposition", { method: "POST", body: JSON.stringify({ party, headline, details: details || undefined }) });
      toast("Item created", "success");
      setParty(""); setHeadline(""); setDetails("");
      void load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function addResponse(id: string) {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`/opposition/${id}/response`, { method: "PUT", body: JSON.stringify({ trsResponse: reply }) });
      toast("Response saved", "success");
      setReplyId(null); setReply("");
      void load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Add Opposition Attack" />
        <div className="space-y-3 mt-4">
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Party name (e.g. BJP, Congress)" value={party} onChange={e => setParty(e.target.value)} />
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Headline / claim" value={headline} onChange={e => setHeadline(e.target.value)} />
          <textarea className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron resize-none" rows={3} placeholder="Full details (optional)" value={details} onChange={e => setDetails(e.target.value)} />
          <button disabled={busy || !party.trim() || !headline.trim()} onClick={create} className="rounded-md bg-saffron px-6 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : "Add to Tracker"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeader title="All Items" count={items?.length} />
        <div className="space-y-3">
          {items === null ? [0,1].map(i => <SkeletonRow key={i} />) : items.length === 0 ? (
            <EmptyState glyph="🛡️" title="No items yet" message="Add opposition attacks above to craft counter-narratives." />
          ) : items.map(item => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-start gap-2">
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 shrink-0">{item.party}</span>
                <div className="font-bold text-slate-900">{item.headline}</div>
              </div>
              {item.details && <div className="text-sm text-slate-600">{item.details}</div>}
              {item.trsResponse ? (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="text-xs font-bold text-green-700 mb-0.5">TRS response:</div>
                  <div className="text-sm text-green-800">{item.trsResponse}</div>
                </div>
              ) : replyId === item.id ? (
                <div className="space-y-2">
                  <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-saffron resize-none" rows={3} placeholder="TRS counter-narrative" value={reply} onChange={e => setReply(e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => addResponse(item.id)} className="rounded-md bg-saffron px-4 py-1.5 text-xs font-bold text-navy disabled:opacity-50">{busy ? "Saving…" : "Save Response"}</button>
                    <button onClick={() => { setReplyId(null); setReply(""); }} className="rounded-md bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setReplyId(item.id); setReply(""); }} className="text-xs font-bold text-saffron hover:underline">+ Add TRS response</button>
              )}
              <div className="text-xs text-slate-400">{formatDate(item.createdAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Booth Tasks — report view                                           */
/* ================================================================== */

type TaskReportItem = { id: string; title: string; description: string | null; dueAt: string | null; _count: { completions: number }; assignedTo: { name: string } | null };
type TaskReport = { total: number; completedCount: number; pct: number; tasks: TaskReportItem[] };

function BoothTasksSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [orgUnitId, setOrgUnitId] = useState("");
  const [report, setReport] = useState<TaskReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!orgUnitId.trim()) return;
    setBusy(true);
    try { setReport(await api<TaskReport>(`/booth-tasks/report?orgUnitId=${encodeURIComponent(orgUnitId.trim())}`)); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Task Report by Unit" />
        <div className="flex gap-3 mt-4">
          <input className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Org Unit ID" value={orgUnitId} onChange={e => setOrgUnitId(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} />
          <button disabled={busy || !orgUnitId.trim()} onClick={load} className="rounded-md bg-navy px-5 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50">{busy ? "Loading…" : "Load"}</button>
        </div>
      </section>

      {report !== null && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total tasks" value={report.total} accent="navy" />
            <StatCard label="Completed" value={report.completedCount} accent="green" />
            <StatCard label="Completion %" value={`${report.pct}%`} accent="saffron" />
          </div>
          <section>
            <SectionHeader title="Tasks" count={report.tasks.length} />
            <div className="space-y-3">
              {report.tasks.length === 0 ? (
                <EmptyState glyph="📋" title="No tasks" message="No booth tasks for this unit." />
              ) : report.tasks.map(t => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{t.title}</div>
                      {t.description && <div className="text-sm text-slate-500 mt-0.5">{t.description}</div>}
                      {t.assignedTo && <div className="text-xs text-slate-400 mt-1">Assigned to: {t.assignedTo.name}</div>}
                      {t.dueAt && <div className="text-xs text-slate-400">Due: {formatDate(t.dueAt)}</div>}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold shrink-0 ${t._count.completions > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {t._count.completions > 0 ? `✓ ${t._count.completions}` : "Pending"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* WA Groups — upsert + view                                          */
/* ================================================================== */

type WaGroupInfo = { id: string; orgUnitId: string; link: string; label: string | null; updatedAt: string };

function WaGroupsSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [orgUnitId, setOrgUnitId] = useState("");
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [info, setInfo] = useState<WaGroupInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function fetchGroup() {
    if (!orgUnitId.trim()) return;
    setBusy(true);
    try { setInfo(await api<WaGroupInfo>(`/wa-groups/${orgUnitId.trim()}`)); }
    catch (e) {
      setInfo(null);
      const msg = (e as Error).message ?? "";
      if (!msg.includes("404") && !msg.includes("Not Found")) toast(msg || "Failed to load group", "error");
    }
    finally { setBusy(false); }
  }

  async function upsert() {
    if (!orgUnitId.trim() || !link.trim()) return;
    setBusy(true);
    try {
      await api(`/wa-groups/${orgUnitId.trim()}`, { method: "PUT", body: JSON.stringify({ link, label: label || undefined }) });
      toast("Group saved", "success");
      void fetchGroup();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Manage WhatsApp Group" />
        <div className="space-y-3 mt-4">
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Org Unit ID" value={orgUnitId} onChange={e => setOrgUnitId(e.target.value)} onBlur={fetchGroup} />
          {info !== undefined && info !== null && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
              Current: <a href={info.link} target="_blank" rel="noreferrer" className="font-bold text-green-700 hover:underline">{info.label ?? info.link}</a> · updated {formatDate(info.updatedAt)}
            </div>
          )}
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="WhatsApp invite link (https://chat.whatsapp.com/…)" value={link} onChange={e => setLink(e.target.value)} />
          <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-saffron" placeholder="Label (optional, e.g. Booth 42 Karyakartalu)" value={label} onChange={e => setLabel(e.target.value)} />
          <button disabled={busy || !orgUnitId.trim() || !link.trim()} onClick={upsert} className="rounded-md bg-green-600 px-6 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : "Save Group"}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Canvassing — voter contact statistics                               */
/* ================================================================== */

type VoterContactSentiment = "positive" | "neutral" | "negative" | "undecided";

interface VoterContactRow {
  id: string;
  voterName: string;
  boothId: string;
  sentiment: VoterContactSentiment;
  issue?: string;
  createdAt: string;
}

interface CanvassingStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  undecided: number;
  recentContacts: VoterContactRow[];
  boothCoverage: { boothId: string; count: number }[];
}

const SENTIMENT_META: {
  key: VoterContactSentiment;
  label: string;
  dot: string;
  card: string;
}[] = [
  { key: "positive",  label: "Positive",  dot: "bg-green-500",  card: "border-green-200 bg-green-50" },
  { key: "neutral",   label: "Neutral",   dot: "bg-slate-400",  card: "border-slate-200 bg-slate-50" },
  { key: "negative",  label: "Negative",  dot: "bg-rose-500",   card: "border-rose-200 bg-rose-50" },
  { key: "undecided", label: "Undecided", dot: "bg-amber-400",  card: "border-amber-200 bg-amber-50" },
];

function CanvassingSection() {
  const { api } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState<CanvassingStats | null>(null);
  const loading = stats === null;

  const load = useCallback(async () => {
    try {
      setStats(await api<CanvassingStats>("/admin/canvassing/stats"));
    } catch {
      // Endpoint may not exist yet — fall back to a graceful empty state
      setStats({
        total: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        undecided: 0,
        recentContacts: [],
        boothCoverage: [],
      });
      toast("Canvassing stats unavailable — endpoint not yet deployed", "error");
    }
  }, [api, toast]);

  useEffect(() => { void load(); }, [load]);

  function pct(n: number) {
    if (!stats || stats.total === 0) return "0%";
    return `${Math.round((n / stats.total) * 100)}%`;
  }

  return (
    <div className="space-y-8">
      {/* Total counter */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-navy/20 bg-navy p-5 text-white shadow-sm lg:col-span-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">Total contacts logged</p>
          {loading
            ? <div className="mt-2 h-9 w-24 animate-pulse rounded bg-white/20" />
            : <p className="mt-1 text-4xl font-extrabold">{stats.total.toLocaleString()}</p>}
        </div>
      </section>

      {/* Sentiment breakdown */}
      <section>
        <SectionHeader title="Sentiment breakdown" count={loading ? undefined : stats.total} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SENTIMENT_META.map(({ key, label, dot, card }) => {
            const count = stats?.[key] ?? 0;
            return (
              <div key={key} className={`rounded-xl border p-4 shadow-sm ${card}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                </div>
                {loading
                  ? <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
                  : <>
                      <p className="mt-2 text-3xl font-extrabold text-slate-800">{count.toLocaleString()}</p>
                      <p className="text-sm font-semibold text-slate-500">{pct(count)} of total</p>
                    </>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent contacts table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Recent contacts" count={loading ? undefined : stats.recentContacts.length} />
        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}</div>
          ) : stats.recentContacts.length === 0 ? (
            <EmptyState glyph="📋" title="No contacts logged yet" />
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4">Voter</th>
                  <th className="pb-2 pr-4">Booth</th>
                  <th className="pb-2 pr-4">Sentiment</th>
                  <th className="pb-2 pr-4">Issue</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.recentContacts.map(c => {
                  const meta = SENTIMENT_META.find(m => m.key === c.sentiment);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 font-semibold text-slate-800">{c.voterName}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{c.boothId}</td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold">
                          <span className={`h-2 w-2 rounded-full ${meta?.dot ?? "bg-slate-300"}`} />
                          {meta?.label ?? c.sentiment}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{c.issue ?? "—"}</td>
                      <td className="py-2.5 text-slate-400">{formatDate(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Booth coverage */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Booth coverage" count={loading ? undefined : stats.boothCoverage.length} />
        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div>
          ) : stats.boothCoverage.length === 0 ? (
            <EmptyState glyph="🗺️" title="No booth data yet" />
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4">Booth ID</th>
                  <th className="pb-2">Contacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.boothCoverage.map(b => (
                  <tr key={b.boothId} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-semibold text-slate-800">{b.boothId}</td>
                    <td className="py-2.5 text-slate-600">{b.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
