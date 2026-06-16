import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import type { AuthResult, UserPublic } from "@pw/shared";
import { API_URL, isWeb } from "../config";
import { tokenStore } from "./token-store";
import { CONSTITUENCY_NAMES } from "../data/telangana";


// ---------------------------------------------------------------------------

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

async function captureLocationForUser(
  userId: string,
  apiFn: <T>(path: string, opts?: RequestInit) => Promise<T>,
): Promise<void> {
  try {
    const Location = await import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [addr] = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });

    const candidates = [addr?.subregion, addr?.city, addr?.district, addr?.name]
      .filter((s): s is string => !!s);

    const matched = CONSTITUENCY_NAMES.find((name) =>
      candidates.some(
        (c) =>
          c.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(c.toLowerCase()),
      ),
    );

    if (matched) {
      await apiFn("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ constituency: matched }),
      });
    }
  } catch {
    // Non-critical — location is best-effort
  }
}

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
          // Skip Content-Type for FormData — the fetch impl sets multipart+boundary automatically.
          ...(!(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          "bypass-tunnel-reminder": "true",
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

  const requestOtp = useCallback(async (phone: string) => {
    const res = await rawFetch("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  }, [rawFetch]);

  const login = useCallback(async (phone: string, code: string) => {
    const res = await rawFetch("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code, client: isWeb ? "web" : "native" }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as AuthResult;
    accessRef.current = data.accessToken;
    if (!isWeb && data.refreshToken) await tokenStore.setRefresh(data.refreshToken);
    setUser(data.user);

    // Silently capture GPS on native if constituency not yet set
    if (Platform.OS !== "web" && !data.user.constituency) {
      void captureLocationForUser(data.user.id, api);
    }
  }, [rawFetch, api]);

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

  // Register Expo push token whenever the user logs in (native only)
  useEffect(() => {
    if (!user || isWeb) return;

    void (async () => {
      try {
        // Dynamically import to avoid breaking the web bundle
        const Notifications = await import("expo-notifications");
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        // The EAS projectId is required for a valid token in release builds.
        const Constants = (await import("expo-constants")).default;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        const platform = Platform.OS === "ios" ? "ios" : "android";

        await api("/push/token", {
          method: "POST",
          body: JSON.stringify({ token: tokenData.data, platform }),
        });
      } catch {
        // Non-critical — silently ignore errors (simulator / web)
      }
    })();
  }, [user, api]);

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
