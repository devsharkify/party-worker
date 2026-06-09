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

// ---------------------------------------------------------------------------
// Demo mode — any phone + OTP 123456 works; all API calls return mock data
// ---------------------------------------------------------------------------
const DEMO_MODE = false;

const DEMO_USER: UserPublic = {
  id: "demo-user-1",
  name: "Ravi Kumar",
  phone: "+919876543210",
  photoUrl: null,
  designation: "Area Secretary",
  role: "worker",
  tier: "karyakarta",
  orgUnitId: "booth-1",
  orgUnitName: "Area 42 – Kukatpally",
  boothName: "Area 42",
  preferredLanguage: "te",
  lifetimeReputation: 1240,
  weeklyLeaguePoints: 380,
  membershipActive: true,
  isLeader: false,
};

const DEMO_OTP = "123456";

function demoApi(path: string, opts: RequestInit = {}): unknown {
  const method = (opts.method ?? "GET").toUpperCase();

  // POST / PUT / PATCH / DELETE — return generic success
  if (method !== "GET") {
    if (path === "/grievances") return { id: "demo-g1", title: "Demo grievance", status: "open", createdAt: new Date().toISOString(), pointsAwarded: 10 };
    if (path.includes("/rsvp")) return { eventId: "e1", status: "going" };
    if (path.includes("/checkin")) return { checkedIn: true, pointsAwarded: 20 };
    if (path.includes("/share")) return { shareEventId: "s1", trackedLink: "https://example.com/t/abc", caption: "Join us!", basePointsAwarded: 5 };
    if (path.includes("/render")) return { creativeId: "c1", userId: "demo-user-1", deviceTier: "high", cachedUrl: null, usedServerFallback: false };
    if (path.includes("/ai/caption")) return { caption: "Join the movement for Telangana's future! #TRS" };
    return { ok: true };
  }

  if (path === "/feed") return [
    { creativeId: "c1", title: "Party Rally – Hyderabad", type: "image", sourceUrl: "https://picsum.photos/seed/rally/800/450", thumbnailUrl: "https://picsum.photos/seed/rally/400/225", templateId: null, captionVariants: { te: "తెలంగాణ మేల్కొంది!", en: "Telangana rises!" }, aiLabeled: true, mcmcCertified: true, publishedAt: new Date().toISOString(), personalizedUrl: null, isNew: true },
    { creativeId: "c2", title: "Welfare Scheme Launch", type: "image", sourceUrl: "https://picsum.photos/seed/scheme/800/450", thumbnailUrl: "https://picsum.photos/seed/scheme/400/225", templateId: null, captionVariants: { te: "రైతు బంధు – మరో అడుగు", en: "Rythu Bandhu – another milestone" }, aiLabeled: false, mcmcCertified: false, publishedAt: new Date(Date.now() - 86400000).toISOString(), personalizedUrl: null, isNew: false },
    { creativeId: "c3", title: "Youth Wing Drive", type: "image", sourceUrl: "https://picsum.photos/seed/youth/800/450", thumbnailUrl: "https://picsum.photos/seed/youth/400/225", templateId: null, captionVariants: { te: "యువత – మన భవిష్యత్తు", en: "Youth – our future" }, aiLabeled: true, mcmcCertified: false, publishedAt: new Date(Date.now() - 172800000).toISOString(), personalizedUrl: null, isNew: false },
  ];

  if (path === "/announcements") return [
    { id: "a1", title: "Area Meeting – Saturday 6 PM", body: "All members must attend the weekly coordination meeting at the community hall.", createdAt: new Date().toISOString(), priority: "high" },
    { id: "a2", title: "Door-to-door Campaign", body: "Campaign drive starts Monday. Collect the ward list from your booth leader.", createdAt: new Date(Date.now() - 86400000).toISOString(), priority: "normal" },
  ];

  if (path === "/events") return [
    { id: "e1", title: "Constituency Rally", description: "Grand public meeting with senior leaders", startsAt: new Date(Date.now() + 86400000 * 2).toISOString(), location: "LB Stadium, Hyderabad", lat: 17.3961, lng: 78.4682, qrToken: "demo-qr-token", orgUnitId: "booth-1", rsvpStatus: null, checkedIn: false },
    { id: "e2", title: "Member Volunteer Training", description: "Mandatory training session for all members", startsAt: new Date(Date.now() + 86400000 * 5).toISOString(), location: "Kukatpally Community Hall", lat: 17.4947, lng: 78.3996, qrToken: "demo-qr-token-2", orgUnitId: "booth-1", rsvpStatus: "going", checkedIn: false },
  ];

  if (path === "/grievances/mine" || path === "/grievances") return [
    { id: "g1", title: "Road pothole near Main St", status: "inProgress", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), description: "Large pothole causing accidents", citizenName: "Suresh", citizenPhone: "+919000000001", location: "Main St, Kukatpally", photoUrl: null },
    { id: "g2", title: "Streetlight not working", status: "open", createdAt: new Date(Date.now() - 86400000).toISOString(), description: "Dark road is unsafe at night", citizenName: "Lakshmi", citizenPhone: "+919000000002", location: "Cross Rd 5, Kukatpally", photoUrl: null },
  ];

  if (path === "/scoring/summary") return {
    lifetimeReputation: 1240,
    weeklyLeaguePoints: 380,
    tier: "karyakarta",
    nextTier: "gold",
    pointsToNextTier: 260,
    streakDays: 7,
    ranks: { booth: 3, mandal: 14, district: 52 },
  };

  if (path === "/users/me/card") return {
    userId: "demo-user-1",
    name: "Ravi Kumar",
    photoUrl: null,
    designation: "Area Secretary",
    boothName: "Area 42",
    tier: "karyakarta",
    tierLabel: { te: "సిల్వర్", en: "Silver" },
    qrPayload: "demo-qr",
    membershipActive: true,
  };

  if (path === "/social") return [
    { platform: "whatsapp", type: "personal", connected: false, handle: null, insightsAvailable: false },
    { platform: "instagram", type: "personal", connected: false, handle: null, insightsAvailable: false },
  ];

  if (path === "/me/activity") return [
    { id: "act1", type: "share", points: 5, createdAt: new Date(Date.now() - 3600000).toISOString(), label: "Shared rally post" },
    { id: "act2", type: "grievance", points: 10, createdAt: new Date(Date.now() - 86400000).toISOString(), label: "Filed grievance" },
    { id: "act3", type: "checkin", points: 20, createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), label: "Event check-in" },
  ];

  if (path === "/me/analytics") return {
    shares: 12, reach: 340, grievances: 2, events: 1, weeklyPoints: 380,
  };

  if (path === "/org/manageable") return [
    { id: "booth-1", name: "Area 42 – Kukatpally", type: "booth", parentId: "mandal-1", childrenCount: 0, memberCount: 18 },
  ];

  if (path === "/payments/membership/verify") return { verified: true };

  if (path.startsWith("/feed/") && path.endsWith("/render")) return {
    creativeId: path.split("/")[2], userId: "demo-user-1", deviceTier: "high", cachedUrl: null, usedServerFallback: false,
  };

  if (path.startsWith("/feed/")) return {
    creativeId: path.split("/")[2], title: "Demo Creative", type: "image", sourceUrl: "https://picsum.photos/seed/demo/800/450", thumbnailUrl: null, templateId: null, captionVariants: { te: "డెమో", en: "Demo" }, aiLabeled: false, mcmcCertified: false, publishedAt: new Date().toISOString(), personalizedUrl: null, isNew: false,
  };

  if (path.startsWith("/org/units/") && path.includes("/members")) return [
    { id: "m1", name: "Suresh Reddy", phone: "+919111111111", photoUrl: null, role: "worker", tier: "bronze", designation: null, orgUnitId: "booth-1", orgUnitName: "Area 42", lifetimeReputation: 340, weeklyLeaguePoints: 90, membershipActive: true, isLeader: false },
    { id: "m2", name: "Anitha Rao", phone: "+919222222222", photoUrl: null, role: "worker", tier: "karyakarta", designation: "Secretary", orgUnitId: "booth-1", orgUnitName: "Area 42", lifetimeReputation: 820, weeklyLeaguePoints: 210, membershipActive: true, isLeader: false },
    { id: "m3", name: "Mohan Rao", phone: "+919333333333", photoUrl: null, role: "worker", tier: "bronze", designation: null, orgUnitId: "booth-1", orgUnitName: "Area 42", lifetimeReputation: 120, weeklyLeaguePoints: 45, membershipActive: true, isLeader: false },
  ];

  if (path === "/org/members") return [
    { id: "m1", name: "Suresh Reddy", phone: "+919111111111", photoUrl: null, role: "worker", tier: "bronze", designation: null, orgUnitId: "booth-1", orgUnitName: "Area 42", lifetimeReputation: 340, weeklyLeaguePoints: 90, membershipActive: true, isLeader: false },
    { id: "m2", name: "Anitha Rao", phone: "+919222222222", photoUrl: null, role: "worker", tier: "karyakarta", designation: "Secretary", orgUnitId: "booth-1", orgUnitName: "Area 42", lifetimeReputation: 820, weeklyLeaguePoints: 210, membershipActive: true, isLeader: false },
  ];

  // leaderboard
  if (path.includes("leaderboard") || path === "/scoring/leaderboard") return {
    level: "booth",
    orgUnitId: "booth-1",
    orgUnitName: "Area 42",
    viewerRank: 3,
    entries: [
      { rank: 1, userId: "m2", name: "Anitha Rao", photoUrl: null, tier: "karyakarta", points: 550, isViewer: false },
      { rank: 2, userId: "m1", name: "Suresh Reddy", photoUrl: null, tier: "bronze", points: 420, isViewer: false },
      { rank: 3, userId: "demo-user-1", name: "Ravi Kumar", photoUrl: null, tier: "karyakarta", points: 380, isViewer: true },
      { rank: 4, userId: "m3", name: "Mohan Rao", photoUrl: null, tier: "bronze", points: 200, isViewer: false },
    ],
  };

  return null;
}

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
          "bypass-tunnel-reminder": "true",
          ...(opts.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [],
  );

  const doRefresh = useCallback(async (): Promise<string | null> => {
    if (DEMO_MODE) {
      // In demo mode, restore the demo user from storage flag
      const saved = typeof window !== "undefined" && window.sessionStorage?.getItem("demo_logged_in");
      if (saved) setUser(DEMO_USER);
      return null;
    }
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
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 200)); // fake network delay
        return demoApi(path, opts) as T;
      }
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
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      return { sent: true, devHint: DEMO_OTP };
    }
    const res = await rawFetch("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  }, [rawFetch]);

  const login = useCallback(async (phone: string, code: string) => {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 800));
      if (code !== DEMO_OTP) throw new Error("Incorrect OTP. Use 123456");
      if (typeof window !== "undefined") window.sessionStorage?.setItem("demo_logged_in", "1");
      setUser({ ...DEMO_USER, phone });
      return;
    }
    const res = await rawFetch("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code, client: isWeb ? "web" : "native" }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as AuthResult;
    accessRef.current = data.accessToken;
    if (!isWeb && data.refreshToken) await tokenStore.setRefresh(data.refreshToken);
    setUser(data.user);
  }, [rawFetch]);

  const logout = useCallback(async () => {
    if (DEMO_MODE) {
      if (typeof window !== "undefined") window.sessionStorage?.removeItem("demo_logged_in");
      setUser(null);
      return;
    }
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
    if (DEMO_MODE) { setUser(DEMO_USER); return; }
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

        const tokenData = await Notifications.getExpoPushTokenAsync();
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
