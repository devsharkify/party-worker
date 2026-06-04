"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AuthResult, UserPublic } from "@pw/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface AdminAuth {
  user: UserPublic | null;
  loading: boolean;
  requestOtp: (phone: string) => Promise<{ sent: boolean; devHint?: string }>;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  api: <T>(path: string, opts?: RequestInit) => Promise<T>;
  uploadFile: (file: File) => Promise<{ key: string; url: string }>;
}

const Ctx = createContext<AdminAuth | null>(null);

async function errMsg(res: Response): Promise<string> {
  try {
    const b = await res.json();
    const m = b?.message;
    return Array.isArray(m) ? m.join(", ") : (m ?? `Error ${res.status}`);
  } catch {
    return `Error ${res.status}`;
  }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const access = useRef<string | null>(null);

  const raw = useCallback(
    (path: string, opts: RequestInit = {}, token?: string | null) =>
      fetch(`${API}${path}`, {
        ...opts,
        credentials: "include",
        headers: {
          ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [],
  );

  const doRefresh = useCallback(async () => {
    const res = await raw("/auth/refresh", { method: "POST", body: JSON.stringify({}) });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResult;
    access.current = data.accessToken;
    setUser(data.user);
    return data.accessToken;
  }, [raw]);

  const api = useCallback(
    async <T,>(path: string, opts: RequestInit = {}): Promise<T> => {
      let res = await raw(path, opts, access.current);
      if (res.status === 401) {
        const tok = await doRefresh();
        if (tok) res = await raw(path, opts, tok);
      }
      if (!res.ok) throw new Error(await errMsg(res));
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [raw, doRefresh],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      let res = await raw("/creatives/upload", { method: "POST", body: fd }, access.current);
      if (res.status === 401) {
        const tok = await doRefresh();
        if (tok) res = await raw("/creatives/upload", { method: "POST", body: fd }, tok);
      }
      if (!res.ok) throw new Error(await errMsg(res));
      return res.json();
    },
    [raw, doRefresh],
  );

  const requestOtp = useCallback(
    async (phone: string) => {
      const res = await raw("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
      if (!res.ok) throw new Error(await errMsg(res));
      return res.json();
    },
    [raw],
  );

  const login = useCallback(
    async (phone: string, code: string) => {
      const res = await raw("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code, client: "web" }),
      });
      if (!res.ok) throw new Error(await errMsg(res));
      const data = (await res.json()) as AuthResult;
      access.current = data.accessToken;
      setUser(data.user);
    },
    [raw],
  );

  const logout = useCallback(async () => {
    await raw("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    access.current = null;
    setUser(null);
  }, [raw]);

  useEffect(() => {
    void doRefresh().finally(() => setLoading(false));
  }, [doRefresh]);

  return (
    <Ctx.Provider value={{ user, loading, requestOtp, login, logout, api, uploadFile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdmin(): AdminAuth {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin outside provider");
  return c;
}
