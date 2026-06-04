"use client";
import { useCallback, useEffect, useState } from "react";
import type { CreativeType, OrgUnitNode, RenderTemplate } from "@pw/shared";
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

interface CreativeRow {
  id: string;
  title: string;
  type: string;
  published: boolean;
  mcmcCertified: boolean;
  aiLabeled: boolean;
  mcmcCertId: string | null;
}

function Dashboard() {
  const { user, logout, api, uploadFile } = useAdmin();
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
    // Templates + org tree power the stats strip; failures degrade gracefully.
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

  // Derived stats.
  const totalCreatives = creatives?.length ?? 0;
  const publishedCount = creatives?.filter((c) => c.published).length ?? 0;
  const certifiedCount = creatives?.filter((c) => c.mcmcCertified).length ?? 0;
  const unitCount = org?.length ?? 0;
  const memberCount = org?.reduce((sum, n) => sum + n.memberCount, 0) ?? 0;
  const boothCount = org?.filter((n) => n.type === "booth").length ?? 0;
  const templateCount = templates?.length ?? 0;
  const creativesLoading = creatives === null;
  const auxLoading = org === null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy px-6 py-4 text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
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
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-6">
        {/* ===== Stats strip ===== */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Creatives" value={totalCreatives} accent="navy" loading={creativesLoading} />
          <StatCard
            label="Published"
            value={publishedCount}
            sub={totalCreatives ? `${Math.round((publishedCount / totalCreatives) * 100)}% live` : undefined}
            accent="green"
            loading={creativesLoading}
          />
          <StatCard label="MCMC certified" value={certifiedCount} accent="saffron" loading={creativesLoading} />
          <StatCard label="Templates" value={templateCount} accent="navy" loading={auxLoading} />
          <StatCard label="Org units" value={unitCount} sub={`${boothCount} booths`} accent="navy" loading={auxLoading} />
          <StatCard label="Members" value={memberCount.toLocaleString()} accent="saffron" loading={auxLoading} />
        </section>

        {/* ===== Create creative ===== */}
        <CreateCreative
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
      </main>
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
  onCreated,
  uploadFile,
  create,
  onError,
}: {
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
  const [busy, setBusy] = useState(false);

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
      });
      setTitle("");
      setTe("");
      setEn("");
      setFile(null);
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
  onCertify,
  onPublish,
}: {
  c: CreativeRow;
  onCertify: (certId: string) => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  const [certId, setCertId] = useState("MCMC/TG/2026/");
  const [busy, setBusy] = useState(false);

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
