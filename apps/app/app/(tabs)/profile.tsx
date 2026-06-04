import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "react-native";
import { useTranslation } from "react-i18next";
import type { MembershipCard, ScoreSummary, SocialAccountInfo } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { setLanguage } from "../../src/i18n";
import { PrimaryButton } from "../../src/components/ui";
import { colors, radius, tierColor } from "../../src/theme";

export default function Profile() {
  const { t, i18n } = useTranslation();
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cardMuted }} contentContainerStyle={{ padding: 16 }}>
      {/* Membership card */}
      {c ? (
        <View style={[st.memCard, { borderColor: tierColor[c.tier] ?? colors.primary }]}>
          <View style={st.memTop}>
            <Image source={{ uri: c.photoUrl ?? undefined }} style={st.memPhoto} />
            <View style={{ flex: 1 }}>
              <Text style={st.memName}>{c.name}</Text>
              <Text style={st.memSub}>{c.designation}</Text>
              <Text style={st.memSub}>{c.boothName}</Text>
            </View>
            <View style={[st.tierBadge, { backgroundColor: tierColor[c.tier] ?? colors.primary }]}>
              <Text style={st.tierBadgeText}>
                {i18n.language === "te" ? c.tierLabel.te : c.tierLabel.en}
              </Text>
            </View>
          </View>
          <View style={st.memBottom}>
            <Text style={st.memId}>{c.qrPayload}</Text>
            <Text style={[st.memStatus, { color: c.membershipActive ? colors.gold : colors.textMutedOnDark }]}>
              {c.membershipActive ? "● " + t("membership.paid") : "○ " + t("membership.fee")}
            </Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
      )}

      {/* Score summary */}
      {sum ? (
        <View style={st.section}>
          <View style={st.scoreRow}>
            <Stat label={t("profile.lifetimePoints")} value={sum.lifetimeReputation} />
            <Stat label={t("profile.weeklyPoints")} value={sum.weeklyLeaguePoints} accent />
          </View>
          {sum.nextTier ? (
            <Text style={st.progress}>
              {sum.pointsToNextTier} {t("common.points")} → {sum.nextTier}
            </Text>
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

      {/* Instagram */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>Instagram</Text>
        {ig?.connected && ig.insightsAvailable ? (
          <Text style={st.connected}>✓ {t("profile.connected")} — @{ig.handle}</Text>
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

      {/* Membership */}
      {c && !c.membershipActive ? (
        <View style={st.section}>
          <Text style={st.sectionTitle}>{t("membership.title")}</Text>
          <PrimaryButton title={t("membership.pay")} onPress={payMembership} loading={busy === "pay"} />
        </View>
      ) : null}

      {/* Language */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>{t("common.language")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["te", "en"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLanguage(l)}
              style={[st.lang, i18n.language === l && st.langActive]}
            >
              <Text style={[st.langText, i18n.language === l && { color: "#fff" }]}>
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
    <View style={st.stat}>
      <Text style={[st.statValue, accent && { color: colors.primaryDark }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  memCard: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 16, borderWidth: 2 },
  memTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  memPhoto: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.bgElevated },
  memName: { color: "#fff", fontSize: 19, fontWeight: "800" },
  memSub: { color: colors.textMutedOnDark, fontSize: 13 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tierBadgeText: { color: "#0b1f3a", fontWeight: "800", fontSize: 12 },
  memBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, alignItems: "center" },
  memId: { color: colors.textMutedOnDark, fontSize: 11, fontFamily: "monospace" },
  memStatus: { fontWeight: "700", fontSize: 13 },
  section: { backgroundColor: "#fff", borderRadius: radius.lg, padding: 16, marginTop: 14, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontWeight: "800", color: colors.text, marginBottom: 10, fontSize: 16 },
  scoreRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.md, padding: 12 },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: "center" },
  progress: { textAlign: "center", color: colors.textMuted, marginTop: 10, fontWeight: "600" },
  ranks: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  rankChip: { backgroundColor: colors.cardMuted, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  rankChipLabel: { fontSize: 11, color: colors.textMuted },
  rankChipVal: { fontSize: 15, fontWeight: "800", color: colors.text },
  connected: { color: colors.success, fontWeight: "700" },
  note: { color: colors.textMuted, marginBottom: 12, lineHeight: 20 },
  lang: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontWeight: "700", color: colors.text },
  logout: { marginTop: 20, marginBottom: 40, alignItems: "center", padding: 14 },
  logoutText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
});
