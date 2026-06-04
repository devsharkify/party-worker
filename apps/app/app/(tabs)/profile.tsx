import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { MembershipCard, ScoreSummary, SocialAccountInfo } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { setLanguage } from "../../src/i18n";
import { PrimaryButton } from "../../src/components/ui";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { QrPayload } from "../../src/components/QrPayload";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colors, radius, shadow, tierColor } from "../../src/theme";

const L = {
  scanHint: { te: "ధృవీకరణ కోసం స్కాన్ చేయండి", en: "Scan to verify membership" },
  social: { te: "సోషల్ ఖాతాలు", en: "Social accounts" },
};

export default function Profile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { logout, api, refreshUser } = useAuth();
  const card = useApi<MembershipCard>("/users/me/card");
  const summary = useApi<ScoreSummary>("/scoring/summary");
  const social = useApi<SocialAccountInfo[]>("/social");
  const [busy, setBusy] = useState<string | undefined>();

  const ig = social.data?.find((s) => s.platform === "instagram");

  async function connectIg() {
    setBusy("ig");
    try {
      await api("/social/instagram/connect", {
        method: "POST",
        body: JSON.stringify({ type: "creator" }),
      });
      await api("/social/instagram/sync", { method: "POST" });
      await Promise.all([social.reload(), summary.reload(), refreshUser()]);
    } finally {
      setBusy(undefined);
    }
  }

  async function payMembership() {
    setBusy("pay");
    try {
      const order = await api<{ orderId: string }>("/payments/membership/start", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await api("/payments/membership/verify", {
        method: "POST",
        body: JSON.stringify({ orderId: order.orderId }),
      });
      await Promise.all([card.reload(), refreshUser()]);
    } finally {
      setBusy(undefined);
    }
  }

  const c = card.data;
  const sum = summary.data;
  const accent = c ? tierColor[c.tier] ?? colors.primary : colors.primary;
  const anyRefreshing = card.refreshing || summary.refreshing || social.refreshing;

  function refreshAll() {
    void Promise.all([card.refresh(), summary.refresh(), social.refresh()]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.cardMuted }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={anyRefreshing}
          onRefresh={refreshAll}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ===== Membership card ===== */}
      {c ? (
        <View style={[st.memCard, shadow]}>
          {/* tier accent bar */}
          <View style={[st.accentBar, { backgroundColor: accent }]} />
          <View style={st.memHeaderRow}>
            <Text style={st.brand}>★ {t("common.appName")}</Text>
            <View style={[st.tierBadge, { backgroundColor: accent }]}>
              <Text style={st.tierBadgeText}>
                {lang === "te" ? c.tierLabel.te : c.tierLabel.en}
              </Text>
            </View>
          </View>

          <View style={st.memTop}>
            <View style={[st.photoRing, { borderColor: accent }]}>
              <RemoteImage uri={c.photoUrl} width={64} height={64} radius={32} placeholderColor={colors.bgElevated} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.memName} numberOfLines={1}>
                {c.name}
              </Text>
              {c.designation ? (
                <Text style={st.memSub} numberOfLines={1}>
                  {c.designation}
                </Text>
              ) : null}
              {c.boothName ? (
                <Text style={st.memSub} numberOfLines={1}>
                  {c.boothName}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={st.qrRow}>
            <QrPayload value={c.qrPayload} size={108} color={colors.bg} />
            <View style={st.qrMeta}>
              <Text style={st.scanHint}>{L.scanHint[lang as "te" | "en"] ?? L.scanHint.en}</Text>
              <View
                style={[
                  st.statusChip,
                  { backgroundColor: c.membershipActive ? "rgba(255,213,74,0.18)" : "rgba(159,179,209,0.16)" },
                ]}
              >
                <Text
                  style={[
                    st.statusText,
                    { color: c.membershipActive ? colors.gold : colors.textMutedOnDark },
                  ]}
                >
                  {c.membershipActive ? "● " + t("membership.paid") : "○ " + t("membership.fee")}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : card.error ? (
        <View style={[st.memCard, shadow, { alignItems: "center", paddingVertical: 28 }]}>
          <Text style={st.cardErr}>{card.error}</Text>
          <Pressable onPress={card.reload} style={st.smallRetry}>
            <Text style={st.smallRetryText}>↻ {t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[st.memCard, { padding: 18 }]}>
          <SkeletonBlock width={140} height={18} dark />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16, alignItems: "center" }}>
            <SkeletonBlock width={64} height={64} rounded={32} dark />
            <View style={{ flex: 1 }}>
              <SkeletonBlock width="60%" height={18} dark />
              <SkeletonBlock width="40%" height={12} dark style={{ marginTop: 8 }} />
            </View>
          </View>
          <SkeletonBlock width={108} height={108} dark style={{ marginTop: 16 }} />
        </View>
      )}

      {/* ===== Score summary ===== */}
      {sum ? (
        <View style={st.section}>
          <View style={st.scoreRow}>
            <Stat label={t("profile.lifetimePoints")} value={sum.lifetimeReputation} />
            <Stat label={t("profile.weeklyPoints")} value={sum.weeklyLeaguePoints} accent />
          </View>
          {sum.nextTier ? (
            <View style={st.nextTier}>
              <Text style={st.nextTierText}>
                {sum.pointsToNextTier} {t("common.points")} → {sum.nextTier}
              </Text>
            </View>
          ) : null}
          <View style={st.ranks}>
            {(["booth", "mandal", "constituency", "district", "state"] as const).map((lv) =>
              sum.ranks[lv] ? (
                <View key={lv} style={st.rankChip}>
                  <Text style={st.rankChipLabel}>{t(`leaderboard.${lv}`)}</Text>
                  <Text style={st.rankChipVal}>#{sum.ranks[lv]}</Text>
                </View>
              ) : null,
            )}
          </View>
        </View>
      ) : null}

      {/* ===== Instagram ===== */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>{L.social[lang as "te" | "en"] ?? L.social.en}</Text>
        {ig?.connected && ig.insightsAvailable ? (
          <View style={st.connectedRow}>
            <Text style={st.connected}>✓ {t("profile.connected")}</Text>
            <Text style={st.handle}>@{ig.handle}</Text>
          </View>
        ) : (
          <>
            <Text style={st.note}>{t("profile.basePointsOnly")}</Text>
            <PrimaryButton
              title={t("profile.connectInstagram")}
              onPress={connectIg}
              loading={busy === "ig"}
            />
          </>
        )}
      </View>

      {/* ===== Membership CTA ===== */}
      {c && !c.membershipActive ? (
        <View style={st.section}>
          <Text style={st.sectionTitle}>{t("membership.title")}</Text>
          <Text style={st.note}>{t("membership.fee")}</Text>
          <PrimaryButton title={t("membership.pay")} onPress={payMembership} loading={busy === "pay"} />
        </View>
      ) : null}

      {/* ===== Language ===== */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>{t("common.language")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["te", "en"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLanguage(l)}
              style={[st.lang, lang === l && st.langActive]}
            >
              <Text style={[st.langText, lang === l && { color: "#fff" }]}>
                {l === "te" ? "తెలుగు" : "English"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable onPress={logout} style={st.logout}>
        <Text style={st.logoutText}>{t("common.logout")}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[st.stat, accent && { backgroundColor: colors.primarySoft }]}>
      <Text style={[st.statValue, accent && { color: colors.primaryDark }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  memCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    padding: 18,
    overflow: "hidden",
  },
  accentBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  memHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 14,
  },
  brand: { color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },
  memTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  photoRing: { borderRadius: 36, borderWidth: 2, padding: 2 },
  memName: { color: "#fff", fontSize: 20, fontWeight: "800" },
  memSub: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 1 },
  tierBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  tierBadgeText: { color: "#0b1f3a", fontWeight: "800", fontSize: 12 },
  qrRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 18 },
  qrMeta: { flex: 1, gap: 10 },
  scanHint: { color: colors.textMutedOnDark, fontSize: 13, lineHeight: 18 },
  statusChip: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontWeight: "800", fontSize: 13 },
  cardErr: { color: colors.textMutedOnDark, textAlign: "center", marginBottom: 12 },
  smallRetry: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 9 },
  smallRetryText: { color: "#fff", fontWeight: "800" },
  section: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  sectionTitle: { fontWeight: "800", color: colors.text, marginBottom: 10, fontSize: 16 },
  scoreRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.md, padding: 14 },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: "center" },
  nextTier: {
    marginTop: 12,
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  nextTierText: { textAlign: "center", color: colors.primaryDark, fontWeight: "700" },
  ranks: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  rankChip: { backgroundColor: colors.cardMuted, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  rankChipLabel: { fontSize: 11, color: colors.textMuted },
  rankChipVal: { fontSize: 15, fontWeight: "800", color: colors.text },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  connected: { color: colors.success, fontWeight: "800" },
  handle: { color: colors.textMuted, fontWeight: "600" },
  note: { color: colors.textMuted, marginBottom: 12, lineHeight: 20 },
  lang: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontWeight: "700", color: colors.text },
  logout: { marginTop: 20, marginBottom: 20, alignItems: "center", padding: 14 },
  logoutText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
});
