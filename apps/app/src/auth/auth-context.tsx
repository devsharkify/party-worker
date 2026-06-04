import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthResult, UserPublic } from "@pw/shared";
import { API_URL, isWeb } from "../config";
import { tokenStore } from "./token-store";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  requestOtp: (phone: string) => Promise<{ sent: boolean; devHint?: string }>;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: UserPublic) => void;
  api: <T>(path: string, opts?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const m = body?.message ?? body?.error;
    return Array.isArray(m) ? m.join(", ") : (m ?? `Request failed (${res.status})`);
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const accessRef = useRef<string | null>(null);

  const rawFetch = useCallback(
    (path: string, opts: RequestInit = {}, token?: string | null) =>
      fetch(`${API_URL}${path}`, {
        ...opts,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [],
  );

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const refreshToken = await tokenStore.getRefresh();
    const res = await rawFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify(isWeb ? {} : { refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResult;
    accessRef.current = data.accessToken;
    if (!isWeb && data.refreshToken) await tokenStore.setRefresh(data.refreshToken);
    setUser(data.user);
    return data.accessToken;
  }, [rawFetch]);

  const api = useCallback(
    async <T,>(path: string, opts: RequestInit = {}): Promise<T> => {
      let res = await rawFetch(path, opts, accessRef.current);
      if (res.status === 401) {
        const token = await doRefresh();
        if (token) res = await rawFetch(path, opts, token);
      }
      if (!res.ok) throw new Error(await parseError(res));
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [rawFetch, doRefresh],
  );

  const requestOtp = useCallback(
    async (phone: string) => {
      const res = await rawFetch("/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    [rawFetch],
  );

  const login = useCallback(
    async (phone: string, code: string) => {
      const res = await rawFetch("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code, client: isWeb ? "web" : "native" }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = (await res.json()) as AuthResult;
      accessRef.current = data.accessToken;
      if (!isWeb && data.refreshToken) await tokenStore.setRefresh(data.refreshToken);
      setUser(data.user);
    },
    [rawFetch],
  );

  const logout = useCallback(async () => {
    const refreshToken = await tokenStore.getRefresh();
    await rawFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify(isWeb ? {} : { refreshToken }),
    }).catch(() => undefined);
    await tokenStore.setRefresh(null);
    accessRef.current = null;
    setUser(null);
  }, [rawFetch]);

  const refreshUser = useCallback(async () => {
    setUser(await api<UserPublic>("/users/me"));
  }, [api]);

  useEffect(() => {
    void doRefresh().finally(() => setLoading(false));
  }, [doRefresh]);

  return (
    <AuthContext.Provider
      value={{ user, loading, requestOtp, login, logout, refreshUser, setUser, api }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
