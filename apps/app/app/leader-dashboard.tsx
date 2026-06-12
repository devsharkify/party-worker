import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { useApi } from "../src/hooks";
import { useAuth } from "../src/auth/auth-context";
import { colors, fontFamily, lh, radius, shadow, tierColor } from "../src/theme";

// ─── types ───────────────────────────────────────────────────────────────────

type ActivityLabel = { te: string; en: string } | string;

interface ActivityItem {
  id: string;
  reason: string;
  points: number;
  createdAt: string;
  label: ActivityLabel;
}

interface ChildUnitStat {
  unitId: string;
  unitName: string;
  unitType: string;
  memberCount: number;
  activeMembers: number;
  weeklyPoints: number;
}

interface TeamStats {
  unitId: string;
  unitName: string;
  memberCount: number;
  activeMembers: number;
  membersWithMembership: number;
  totalWeeklyPoints: number;
  totalReach: number;
  totalShares: number;
  topPerformers: { userId: string; name: string; tier: string; weeklyLeaguePoints: number }[];
  childUnits: ChildUnitStat[];
}

const L = {
  title: { te: "నాయకుల డాష్‌బోర్డ్", en: "Leader Dashboard" },
  myTeam: { te: "నా టీమ్", en: "My Team" },
  members: { te: "మొత్తం సభ్యులు", en: "Total Members" },
  active: { te: "ఈ వారం యాక్టివ్", en: "Active This Week" },
  reach: { te: "మొత్తం రీచ్", en: "Total Reach" },
  shares: { te: "షేర్లు", en: "Shares" },
  topPerformers: { te: "టాప్ పెర్ఫార్మర్లు", en: "Top Performers" },
  myUnits: { te: "నా యూనిట్లు (ర్యాంక్)", en: "My Units (ranked)" },
  unitsHint: {
    te: "సున్నా యాక్టివిటీ యూనిట్లు ఎరుపు రంగులో — అక్కడ దృష్టి పెట్టండి",
    en: "Zero-activity units in red — coverage gaps to fix",
  },
  recentActivity: { te: "ఇటీవలి కార్యకలాపాలు", en: "Recent Activity" },
  noMembers: { te: "మీ యూనిట్‌లో ఇంకా సభ్యులు లేరు.", en: "No members yet in your unit." },
  noActivity: { te: "ఇటీవలి కార్యకలాపాలు లేవు.", en: "No recent activity." },
  noUnits: { te: "ఉప-యూనిట్లు లేవు.", en: "No sub-units." },
  inactiveBtn: { te: "నిష్క్రియ సభ్యులు (కాల్ లిస్ట్)", en: "Inactive Members (call list)" },
  onboard: { te: "కొత్త సభ్యుడిని చేర్చండి", en: "Onboard New Member" },
  inviteLink: { te: "లింక్ ద్వారా ఆహ్వానించండి", en: "Invite via Link" },
  shareReport: { te: "వార నివేదిక షేర్ చేయండి", en: "Share Weekly Report" },
  reportCopied: { te: "నివేదిక కాపీ అయింది — గ్రూప్‌లో పేస్ట్ చేయండి", en: "Report copied — paste in your group" },
  fullTeam: { te: "పూర్తి టీమ్ చూడండి", en: "View Full Team" },
  review: { te: "సమర్పణల సమీక్ష", en: "Review Submissions" },
  justNow: { te: "ఇప్పుడే", en: "just now" },
};

// ─── sub-components ──────────────────────────────────────────────────────────

function TopPerformerRow({
  name,
  tier,
  points,
  rank,
}: {
  name: string;
  tier: string;
  points: number;
  rank: number;
}) {
  const tierC = (tierColor as Record<string, string>)[tier] ?? colors.textMuted;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const rankColors = ["#FFB300", "#94a3b8", "#fb923c"];
  const rankColor = rankColors[rank - 1] ?? colors.textMuted;
  return (
    <View style={s.performerRow}>
      <View style={[s.rankBadge, { backgroundColor: rankColor + "22", borderColor: rankColor }]}>
        <Text style={[s.rankText, { color: rankColor }]}>{rank}</Text>
      </View>
      <View style={[s.avatarFallback, { backgroundColor: tierC + "22" }]}>
        <Text style={[s.avatarInitial, { color: tierC }]}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.performerName} numberOfLines={1}>{name}</Text>
      </View>
      <View style={s.pointsWrap}>
        <Text style={s.pointsVal}>{points}</Text>
        <Text style={s.pointsLabel}>pts</Text>
      </View>
    </View>
  );
}

function UnitRow({ unit, rank }: { unit: ChildUnitStat; rank: number }) {
  const dead = unit.weeklyPoints === 0 && unit.activeMembers === 0;
  return (
    <View style={s.unitRow}>
      <Text style={[s.unitRank, dead && s.deadText]}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.unitName, dead && s.deadText]} numberOfLines={1}>
          {unit.unitName}
        </Text>
        <Text style={s.unitMeta}>
          {unit.activeMembers}/{unit.memberCount} active
        </Text>
      </View>
      <Text style={[s.unitPts, dead && s.deadText]}>{unit.weeklyPoints}</Text>
    </View>
  );
}

function ActivityRow({ item, lang }: { item: ActivityItem; lang: "te" | "en" }) {
  const iconMap: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
    share: "share-2",
    grievance_file: "alert-circle",
    grievance_resolve: "check-circle",
    event_checkin: "check-square",
    recruit_initial: "user-plus",
    recruit_bonus: "users",
    streak: "zap",
    decay: "trending-down",
    fraud_reversal: "x-circle",
  };
  const icon = iconMap[item.reason] ?? "activity";
  const labelText = typeof item.label === "object" ? (item.label[lang] ?? item.label.en) : item.label;
  const ago = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000);
  const agoLabel =
    ago < 1 ? (L.justNow[lang] ?? L.justNow.en) : ago < 24 ? `${ago}h` : `${Math.floor(ago / 24)}d`;
  return (
    <View style={s.activityRow}>
      <View style={s.activityIcon}>
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <Text style={s.activityLabel} numberOfLines={1}>{labelText}</Text>
      <Text style={s.activityMeta}>{agoLabel}</Text>
      <Text style={s.activityPts}>+{item.points}</Text>
    </View>
  );
}

// ─── report card text ────────────────────────────────────────────────────────

/** WhatsApp-forwardable weekly report — the leader's trophy, his Monday forward. */
function buildReportText(s: TeamStats, lang: "te" | "en"): string {
  const pct = s.memberCount > 0 ? Math.round((s.activeMembers / s.memberCount) * 100) : 0;
  const top = s.topPerformers
    .slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.name} (${p.weeklyLeaguePoints})`)
    .join("  ");
  const deadUnits = s.childUnits.filter((u) => u.weeklyPoints === 0 && u.activeMembers === 0);
  const bestUnit = s.childUnits[0];
  const date = new Date().toLocaleDateString(lang === "te" ? "te-IN" : "en-IN", {
    day: "numeric",
    month: "short",
  });

  if (lang === "te") {
    const lines = [
      `📊 *myTRS వార నివేదిక — ${s.unitName}* (${date})`,
      `👥 సభ్యులు: ${s.memberCount} | ఈ వారం యాక్టివ్: ${s.activeMembers} (${pct}%)`,
      `📣 షేర్లు: ${s.totalShares} | రీచ్: ${s.totalReach}`,
    ];
    if (top) lines.push(`🏆 టాప్: ${top}`);
    if (bestUnit) lines.push(`🥇 బెస్ట్ యూనిట్: ${bestUnit.unitName} (${bestUnit.weeklyPoints})`);
    if (deadUnits.length > 0) lines.push(`⚠️ సున్నా యాక్టివిటీ యూనిట్లు: ${deadUnits.length}`);
    lines.push(`— myTRS యాప్`);
    return lines.join("\n");
  }
  const lines = [
    `📊 *myTRS Weekly Report — ${s.unitName}* (${date})`,
    `👥 Members: ${s.memberCount} | Active this week: ${s.activeMembers} (${pct}%)`,
    `📣 Shares: ${s.totalShares} | Reach: ${s.totalReach}`,
  ];
  if (top) lines.push(`🏆 Top: ${top}`);
  if (bestUnit) lines.push(`🥇 Best unit: ${bestUnit.unitName} (${bestUnit.weeklyPoints})`);
  if (deadUnits.length > 0) lines.push(`⚠️ Zero-activity units: ${deadUnits.length}`);
  lines.push(`— myTRS app`);
  return lines.join("\n");
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LeaderDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: keyof typeof L) => L[k][lang] ?? L[k].en;

  // The rich subtree rollup the API always had — now actually used.
  const stats = useApi<TeamStats>("/team/stats");
  const activity = useApi<ActivityItem[]>("/me/activity");

  const cardRef = useRef<View>(null);
  const [sharingReport, setSharingReport] = useState(false);

  /** Native: capture the stats card as an image + copy the text. Web: WhatsApp text. */
  async function shareReport() {
    if (!stats.data || sharingReport) return;
    setSharingReport(true);
    const text = buildReportText(stats.data, lang);
    try {
      if (Platform.OS !== "web") {
        try {
          const { captureRef } = await import("react-native-view-shot");
          const Sharing = await import("expo-sharing");
          const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
          await Clipboard.setStringAsync(text);
          await Sharing.shareAsync(uri, { mimeType: "image/png" });
          return;
        } catch {
          /* capture unavailable — fall through to text */
        }
      }
      const encoded = encodeURIComponent(text);
      await Clipboard.setStringAsync(text);
      await Linking.openURL(
        Platform.OS === "web" ? `https://wa.me/?text=${encoded}` : `whatsapp://send?text=${encoded}`,
      ).catch(() => undefined);
    } finally {
      setSharingReport(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]} hitSlop={8}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle}>{ll("title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={s.fill} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* My Team summary — captured as the shareable report-card image */}
        <View ref={cardRef} collapsable={false}>
        <LinearGradient
          colors={[colors.navy, "#2a1a3e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.teamCard}
        >
          <View style={s.teamCardHeader}>
            <Feather name="users" size={18} color={colors.gold} />
            <Text style={s.teamCardTitle}>{ll("myTeam")}</Text>
          </View>
          <Text style={s.teamUnitName} numberOfLines={1}>{stats.data?.unitName ?? user?.orgUnitName}</Text>

          {stats.loading && !stats.data ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : (
            <>
              <View style={s.teamStats}>
                <View style={s.teamStat}>
                  <Text style={s.teamStatValue}>{stats.data?.memberCount ?? 0}</Text>
                  <Text style={s.teamStatLabel}>{ll("members")}</Text>
                </View>
                <View style={s.teamStatDivider} />
                <View style={s.teamStat}>
                  <Text style={s.teamStatValue}>{stats.data?.activeMembers ?? 0}</Text>
                  <Text style={s.teamStatLabel}>{ll("active")}</Text>
                </View>
              </View>
              <View style={[s.teamStats, { marginTop: 12 }]}>
                <View style={s.teamStat}>
                  <Text style={s.teamStatValue}>{stats.data?.totalReach ?? 0}</Text>
                  <Text style={s.teamStatLabel}>{ll("reach")}</Text>
                </View>
                <View style={s.teamStatDivider} />
                <View style={s.teamStat}>
                  <Text style={s.teamStatValue}>{stats.data?.totalShares ?? 0}</Text>
                  <Text style={s.teamStatLabel}>{ll("shares")}</Text>
                </View>
              </View>
            </>
          )}
        </LinearGradient>
        </View>

        {/* Share the weekly report — the leader's trophy forward */}
        {stats.data ? (
          <Pressable
            onPress={() => void shareReport()}
            disabled={sharingReport}
            style={({ pressed }) => [s.reportBtn, (pressed || sharingReport) && { opacity: 0.85 }]}
          >
            <Feather name="send" size={16} color={colors.primaryDark} />
            <Text style={s.reportBtnText}>{ll("shareReport")}</Text>
          </Pressable>
        ) : null}

        {/* Unit-vs-unit ranking — the coverage-gap view */}
        {stats.data && stats.data.childUnits.length > 0 ? (
          <>
            <View style={s.sectionHeader}>
              <Feather name="bar-chart-2" size={15} color={colors.gold} />
              <Text style={s.sectionTitle}>{ll("myUnits")}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.unitsHint}>{ll("unitsHint")}</Text>
              {stats.data.childUnits.map((u, i) => (
                <UnitRow key={u.unitId} unit={u} rank={i + 1} />
              ))}
            </View>
          </>
        ) : null}

        {/* Top performers */}
        <View style={s.sectionHeader}>
          <Feather name="trending-up" size={15} color={colors.gold} />
          <Text style={s.sectionTitle}>{ll("topPerformers")}</Text>
        </View>
        <View style={s.card}>
          {stats.loading && !stats.data ? (
            <ActivityIndicator color={colors.primary} />
          ) : !stats.data || stats.data.topPerformers.length === 0 ? (
            <Text style={s.emptyMsg}>{ll("noMembers")}</Text>
          ) : (
            stats.data.topPerformers
              .slice(0, 5)
              .map((m, i) => (
                <TopPerformerRow key={m.userId} name={m.name} tier={m.tier} points={m.weeklyLeaguePoints} rank={i + 1} />
              ))
          )}
        </View>

        {/* Recent activity */}
        <View style={s.sectionHeader}>
          <Feather name="activity" size={15} color={colors.primary} />
          <Text style={s.sectionTitle}>{ll("recentActivity")}</Text>
        </View>
        <View style={s.card}>
          {activity.loading && !activity.data ? (
            <ActivityIndicator color={colors.primary} />
          ) : (activity.data ?? []).length === 0 ? (
            <Text style={s.emptyMsg}>{ll("noActivity")}</Text>
          ) : (
            (activity.data ?? []).slice(0, 5).map((item) => <ActivityRow key={item.id} item={item} lang={lang} />)
          )}
        </View>

        {/* Action buttons */}
        <View style={s.actionRow}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnAlert, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/inactive-members")}
          >
            <Feather name="phone-call" size={16} color="#991B1B" />
            <Text style={[s.actionBtnText, { color: "#991B1B" }]}>{ll("inactiveBtn")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnPrimary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/invite")}
          >
            <Feather name="link" size={16} color="#fff" />
            <Text style={s.actionBtnText}>{ll("inviteLink")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnSecondary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/(tabs)/team")}
          >
            <Feather name="user-plus" size={16} color={colors.primary} />
            <Text style={[s.actionBtnText, { color: colors.primary }]}>{ll("onboard")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnSecondary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/review-submissions")}
          >
            <Feather name="check-square" size={16} color={colors.primary} />
            <Text style={[s.actionBtnText, { color: colors.primary }]}>{ll("review")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnSecondary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/(tabs)/team")}
          >
            <Feather name="users" size={16} color={colors.primary} />
            <Text style={[s.actionBtnText, { color: colors.primary }]}>{ll("fullTeam")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  content: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    fontFamily,
    lineHeight: lh(16),
  },

  teamCard: {
    borderRadius: radius.lg,
    padding: 18,
    ...shadow,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    height: 48,
    marginTop: 12,
    marginBottom: 20,
    ...shadow,
  },
  reportBtnText: { fontSize: 15, fontWeight: "700", color: colors.primaryDark, fontFamily, lineHeight: lh(15) },
  teamCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  teamCardTitle: { fontSize: 16, fontWeight: "700", color: colors.gold, letterSpacing: 0.3, fontFamily, lineHeight: lh(16) },
  teamUnitName: { fontSize: 13, color: colors.textMutedOnDark, fontWeight: "600", marginBottom: 14, fontFamily, lineHeight: lh(13) },
  teamStats: { flexDirection: "row", alignItems: "center" },
  teamStat: { flex: 1, alignItems: "center" },
  teamStatValue: { fontSize: 26, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(26) },
  teamStatLabel: { fontSize: 12, color: colors.textMutedOnDark, fontWeight: "600", marginTop: 2, fontFamily, lineHeight: lh(12), textAlign: "center" },
  teamStatDivider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.2)" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text, textTransform: "uppercase", letterSpacing: 0.5, fontFamily, lineHeight: lh(14) },

  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  emptyMsg: { color: colors.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 8, fontFamily, lineHeight: lh(14) },

  unitsHint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, fontFamily, lineHeight: lh(12) },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unitRank: { width: 22, fontWeight: "700", color: colors.textMuted, fontSize: 13, fontFamily, lineHeight: lh(13) },
  unitName: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily, lineHeight: lh(14) },
  unitMeta: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 1, fontFamily, lineHeight: lh(11) },
  unitPts: { fontWeight: "700", color: colors.primaryDark, fontSize: 15, fontFamily, lineHeight: lh(15) },
  deadText: { color: "#DC2626" },

  performerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontSize: 12, fontWeight: "700", fontFamily, lineHeight: lh(12) },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontWeight: "700", fontFamily, lineHeight: lh(15) },
  performerName: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily, lineHeight: lh(14) },
  pointsWrap: { alignItems: "flex-end" },
  pointsVal: { fontWeight: "700", color: colors.primaryDark, fontSize: 16, fontFamily, lineHeight: lh(16) },
  pointsLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600", fontFamily, lineHeight: lh(10) },

  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  activityLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  activityMeta: { fontSize: 11, color: colors.textMuted, fontWeight: "600", fontFamily, lineHeight: lh(11) },
  activityPts: { fontSize: 13, fontWeight: "700", color: colors.success, minWidth: 30, textAlign: "right", fontFamily, lineHeight: lh(13) },

  actionRow: { gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: 20,
  },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSecondary: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  actionBtnAlert: {
    backgroundColor: "#FEF2F2",
    borderWidth: 2,
    borderColor: "#FCA5A5",
  },
  actionBtnText: { fontSize: 15, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(15) },
});
