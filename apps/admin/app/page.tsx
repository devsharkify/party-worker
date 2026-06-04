"use client";
import { useCallback, useEffect, useState } from "react";
import type { CreativeType } from "@pw/shared";
import { useAdmin } from "../src/admin-auth";

export default function Page() {
  const { user, loading } = useAdmin();
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Loading…</div>;
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
    <div className="grid min-h-screen place-items-center bg-navy p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-1 text-center text-3xl">★</div>
        <h1 className="text-center text-2xl font-extrabold">Party Worker — HQ</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Content studio &amp; compliance</p>

        {step === "phone" ? (
          <>
            <label className="mb-1 block text-sm font-semibold">Admin mobile number</label>
            <input
              className="mb-4 w-full rounded-lg border border-slate-300 px-4 py-3"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
            />
            <button
              onClick={send}
              disabled={busy}
              className="w-full rounded-lg bg-saffron py-3 font-bold text-white disabled:opacity-50"
            >
              {busy ? "…" : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-semibold">Enter OTP</label>
            <input
              className="mb-2 w-full rounded-lg border border-slate-300 px-4 py-3"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
            />
            {hint ? <p className="mb-3 text-sm text-slate-500">Dev code: {hint}</p> : null}
            <button
              onClick={verify}
              disabled={busy}
              className="w-full rounded-lg bg-saffron py-3 font-bold text-white disabled:opacity-50"
            >
              {busy ? "…" : "Verify & enter"}
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
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [msg, setMsg] = useState<string>();

  const load = useCallback(async () => {
    try {
      setCreatives(await api<CreativeRow[]>("/creatives"));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-navy px-6 py-4 text-white">
        <div>
          <span className="text-lg font-extrabold">★ Party Worker HQ</span>
          <span className="ml-3 text-sm text-slate-300">Content Studio</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-300">{user?.name}</span>
          <button onClick={logout} className="rounded-md bg-white/10 px-3 py-1 font-semibold">
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {msg ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {msg}
          </div>
        ) : null}

        <CreateCreative
          onCreated={load}
          uploadFile={uploadFile}
          create={(body) => api("/creatives", { method: "POST", body: JSON.stringify(body) })}
        />

        <h2 className="mb-3 mt-8 text-xl font-bold">Creatives</h2>
        <div className="space-y-3">
          {creatives.map((c) => (
            <CreativeCard
              key={c.id}
              c={c}
              onCertify={async (certId) => {
                await api(`/creatives/${c.id}/certify`, {
                  method: "POST",
                  body: JSON.stringify({ mcmcCertId: certId }),
                });
                setMsg(`Certified “${c.title}” (${certId}).`);
                await load();
              }}
              onPublish={async () => {
                try {
                  await api(`/creatives/${c.id}/publish`, { method: "POST" });
                  setMsg(`Published “${c.title}” — it now appears in the worker feed.`);
                  await load();
                } catch (e) {
                  setMsg(`Publish blocked: ${(e as Error).message}`);
                }
              }}
            />
          ))}
          {creatives.length === 0 ? <p className="text-slate-500">No creatives yet.</p> : null}
        </div>
      </main>
    </div>
  );
}

function CreateCreative({
  onCreated,
  uploadFile,
  create,
}: {
  onCreated: () => Promise<void>;
  uploadFile: (f: File) => Promise<{ key: string }>;
  create: (body: unknown) => Promise<unknown>;
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold">New creative</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value as CreativeType)}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="carousel">Carousel</option>
        </select>
        <textarea
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="తెలుగు caption"
          value={te}
          onChange={(e) => setTe(e.target.value)}
        />
        <textarea
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="English caption"
          value={en}
          onChange={(e) => setEn(e.target.value)}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <button
          onClick={submit}
          disabled={busy || !title}
          className="rounded-lg bg-navy px-5 py-2 font-bold text-white disabled:opacity-50"
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold">{c.title}</div>
          <div className="text-sm text-slate-500">{c.type}</div>
        </div>
        <div className="flex gap-2">
          <Badge ok={c.published} okText="Published" noText="Draft" />
          <Badge ok={c.mcmcCertified} okText="MCMC ✓" noText="Uncertified" />
          <Badge ok={c.aiLabeled} okText="AI-labeled" noText="No AI label" />
        </div>
      </div>
      {!c.published ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!c.mcmcCertified ? (
            <>
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
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
                className="rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold"
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
            className="rounded-md bg-green-600 px-3 py-1 text-sm font-bold text-white disabled:opacity-50"
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
