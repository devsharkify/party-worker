import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { ConsentState } from "@pw/shared";
import { useAuth } from "../auth/auth-context";
import { colors, fontFamily, lh, radius, shadow } from "../theme";
import { DUTY_PING_INTERVAL_MS, timeAgo, type FieldMe } from "../lib/field";
import { PERMISSION_DENIED, getPosition } from "../lib/location";

/**
 * Field-duty toggle card (voters hub) — shares my live position with my
 * leaders while duty is ON. DPDP location consent + OS permission gated;
 * re-posts every 60s only while this card stays mounted.
 */
export function FieldDutyCard() {
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [onDuty, setOnDuty] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needConsent, setNeedConsent] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<FieldMe>("/field/me");
        if (cancelled) return;
        setOnDuty(me.onDuty);
        setUpdatedAt(me.updatedAt);
      } catch {
        // Non-fatal — card just starts from OFF.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function stopInterval() {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  const postPosition = useCallback(async (): Promise<{ ok: boolean; onDuty: boolean }> => {
    const pos = await getPosition();
    return api<{ ok: boolean; onDuty: boolean }>("/field/location", {
      method: "POST",
      body: JSON.stringify({ ...pos, onDuty: true }),
    });
  }, [api]);

  /** Start sharing: consent → permission → first ping → 60s interval. */
  async function startDuty(consentJustGranted = false) {
    setBusy(true);
    setError(null);
    try {
      if (!consentJustGranted) {
        // DPDP: purpose "location" must be granted before any position leaves the device.
        const consents = await api<ConsentState[]>("/me/consents");
        const location = consents.find((c) => c.purpose === "location");
        if (!location?.granted) {
          setNeedConsent(true);
          return;
        }
      }
      await postPosition();
      setOnDuty(true);
      setUpdatedAt(new Date().toISOString());
      setNeedConsent(false);
      stopInterval();
      intervalRef.current = setInterval(() => {
        void postPosition()
          .then(() => setUpdatedAt(new Date().toISOString()))
          .catch(() => {
            // Transient ping failure — keep trying on the next tick.
          });
      }, DUTY_PING_INTERVAL_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === PERMISSION_DENIED) {
        setError(
          lang === "te"
            ? "లొకేషన్ అనుమతి ఇవ్వలేదు. ఫోన్ సెట్టింగ్స్‌లో ఈ యాప్‌కు లొకేషన్ అనుమతించండి. (Location permission was denied — allow it in your phone settings.)"
            : "Location permission was denied. Please allow location for this app in your phone settings.",
        );
      } else if (msg.toLowerCase().includes("consent")) {
        setNeedConsent(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  /** Stop sharing: tell the server + kill the interval. */
  async function stopDuty() {
    setBusy(true);
    setError(null);
    stopInterval();
    try {
      await api<{ ok: boolean; onDuty: boolean }>("/field/duty", {
        method: "POST",
        body: JSON.stringify({ onDuty: false }),
      });
      setOnDuty(false);
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function grantConsentAndStart() {
    setBusy(true);
    setError(null);
    try {
      await api<ConsentState>("/me/consents", {
        method: "POST",
        body: JSON.stringify({ purpose: "location", granted: true }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    setNeedConsent(false);
    await startDuty(true);
  }

  function onToggle(value: boolean) {
    if (busy) return;
    if (value) void startDuty();
    else void stopDuty();
  }

  return (
    <View style={st.card}>
      <View style={st.topRow}>
        <View style={st.iconRing}>
          <Feather name="navigation" size={18} color={onDuty ? colors.success : colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{lang === "te" ? "క్షేత్ర డ్యూటీ" : "Field Duty"}</Text>
          <Text style={st.state}>
            {loading
              ? "…"
              : onDuty
                ? (lang === "te" ? "డ్యూటీలో ఉన్నారు" : "On duty") +
                  (updatedAt ? `  ·  ${timeAgo(updatedAt, lang)}` : "")
                : lang === "te"
                  ? "డ్యూటీలో లేరు"
                  : "Off duty"}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Switch
            value={onDuty}
            onValueChange={onToggle}
            disabled={loading}
            trackColor={{ false: colors.border, true: colors.success + "88" }}
            thumbColor={onDuty ? colors.success : "#f4f4f4"}
            ios_backgroundColor={colors.border}
          />
        )}
      </View>

      {needConsent ? (
        <View style={st.consentBox}>
          <Text style={st.consentText}>
            {lang === "te"
              ? "డ్యూటీ ఆన్ చేయడానికి లొకేషన్ సమ్మతి అవసరం. మీ లైవ్ లొకేషన్ మీ నాయకులకు మాత్రమే కనిపిస్తుంది."
              : "Turning duty ON needs your location consent. Your live location is visible only to your leaders."}
          </Text>
          <Pressable
            onPress={() => void grantConsentAndStart()}
            disabled={busy}
            style={({ pressed }) => [st.consentBtn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Text style={st.consentBtnText}>
              {lang === "te" ? "అంగీకరించి ఆన్ చేయండి" : "Agree & turn on"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={st.error}>⚠️ {error}</Text> : null}

      <Text style={st.note}>
        {lang === "te"
          ? "డ్యూటీ ఆన్‌లో ఉన్నప్పుడు, యాప్ తెరిచి ఉన్నంతవరకు మాత్రమే మీ లొకేషన్ షేర్ అవుతుంది"
          : "Location is shared only while the app is open and duty is ON"}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginTop: 14, ...shadow,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconRing: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  state: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },

  consentBox: {
    backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12, marginTop: 12,
  },
  consentText: { fontSize: 13, color: colors.text, fontFamily, lineHeight: lh(13) + 4 },
  consentBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingVertical: 10, alignItems: "center", marginTop: 10,
  },
  consentBtnText: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily, lineHeight: lh(14) },

  error: { color: colors.danger, fontSize: 12, fontFamily, lineHeight: lh(12) + 3, marginTop: 10 },
  note: { fontSize: 11, color: colors.textMuted, fontFamily, lineHeight: lh(11) + 3, marginTop: 10 },
});
