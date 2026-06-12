import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import type { OrgMemberRow } from "@pw/shared";
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

// ─── sub-components ──────────────────────────────────────────────────────────

function TopPerformerRow({ member, rank }: { member: OrgMemberRow; rank: number }) {
  const tierC = tierColor[member.tier] ?? colors.textMuted;
  const initial = member.name.trim().charAt(0).toUpperCase() || "?";
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
        <Text style={s.performerName} numberOfLines={1}>{member.name}</Text>
        {member.designation ? (
          <Text style={s.performerDesig} numberOfLines={1}>{member.designation}</Text>
        ) : null}
      </View>
      <View style={s.pointsWrap}>
        <Text style={s.pointsVal}>{member.weeklyLeaguePoints}</Text>
        <Text style={s.pointsLabel}>pts</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
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
  const agoLabel = ago < 1 ? "just now" : ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`;
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

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LeaderDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const orgUnitId = user?.orgUnitId;

  const members = useApi<OrgMemberRow[]>(orgUnitId ? `/org/units/${orgUnitId}/members` : null);
  const activity = useApi<ActivityItem[]>("/me/activity");

  const totalMembers = members.data?.length ?? 0;
  const activeThisWeek = members.data?.filter((m) => m.weeklyLeaguePoints > 0).length ?? 0;
  const topThree = [...(members.data ?? [])].sort((a, b) => b.weeklyLeaguePoints - a.weeklyLeaguePoints).slice(0, 3);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]} hitSlop={8}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle}>Leader Dashboard</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={s.fill} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* My Team summary */}
        <LinearGradient
          colors={[colors.navy, "#2a1a3e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.teamCard}
        >
          <View style={s.teamCardHeader}>
            <Feather name="users" size={18} color={colors.gold} />
            <Text style={s.teamCardTitle}>My Team</Text>
          </View>
          <Text style={s.teamUnitName} numberOfLines={1}>{user?.orgUnitName}</Text>

          {members.loading && !members.data ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={s.teamStats}>
              <View style={s.teamStat}>
                <Text style={s.teamStatValue}>{totalMembers}</Text>
                <Text style={s.teamStatLabel}>Total Members</Text>
              </View>
              <View style={s.teamStatDivider} />
              <View style={s.teamStat}>
                <Text style={s.teamStatValue}>{activeThisWeek}</Text>
                <Text style={s.teamStatLabel}>Active This Week</Text>
              </View>
            </View>
          )}
        </LinearGradient>

        {/* Top performers */}
        <View style={s.sectionHeader}>
          <Feather name="trending-up" size={15} color={colors.gold} />
          <Text style={s.sectionTitle}>Top Performers</Text>
        </View>
        <View style={s.card}>
          {members.loading && !members.data ? (
            <ActivityIndicator color={colors.primary} />
          ) : topThree.length === 0 ? (
            <Text style={s.emptyMsg}>No members yet in your unit.</Text>
          ) : (
            topThree.map((m, i) => <TopPerformerRow key={m.id} member={m} rank={i + 1} />)
          )}
        </View>

        {/* Recent activity */}
        <View style={s.sectionHeader}>
          <Feather name="activity" size={15} color={colors.primary} />
          <Text style={s.sectionTitle}>Recent Activity</Text>
        </View>
        <View style={s.card}>
          {activity.loading && !activity.data ? (
            <ActivityIndicator color={colors.primary} />
          ) : (activity.data ?? []).length === 0 ? (
            <Text style={s.emptyMsg}>No recent activity.</Text>
          ) : (
            (activity.data ?? []).slice(0, 5).map((item) => <ActivityRow key={item.id} item={item} />)
          )}
        </View>

        {/* Action buttons */}
        <View style={s.actionRow}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnPrimary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/(tabs)/team")}
          >
            <Feather name="user-plus" size={16} color="#fff" />
            <Text style={s.actionBtnText}>Onboard New Member</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnSecondary, pressed && { opacity: 0.82 }]}
            onPress={() => router.push("/(tabs)/team")}
          >
            <Feather name="users" size={16} color={colors.primary} />
            <Text style={[s.actionBtnText, { color: colors.primary }]}>View Full Team</Text>
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
    marginBottom: 20,
    ...shadow,
  },
  teamCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  teamCardTitle: { fontSize: 16, fontWeight: "700", color: colors.gold, letterSpacing: 0.3, fontFamily, lineHeight: lh(16) },
  teamUnitName: { fontSize: 13, color: colors.textMutedOnDark, fontWeight: "600", marginBottom: 14, fontFamily, lineHeight: lh(13) },
  teamStats: { flexDirection: "row", alignItems: "center" },
  teamStat: { flex: 1, alignItems: "center" },
  teamStatValue: { fontSize: 28, fontWeight: "900", color: "#fff", fontFamily, lineHeight: lh(28) },
  teamStatLabel: { fontSize: 12, color: colors.textMutedOnDark, fontWeight: "600", marginTop: 2, fontFamily, lineHeight: lh(12) },
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
  rankText: { fontSize: 12, fontWeight: "900", fontFamily, lineHeight: lh(12) },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontWeight: "700", fontFamily, lineHeight: lh(15) },
  performerName: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily, lineHeight: lh(14) },
  performerDesig: { fontSize: 11, color: colors.textMuted, fontWeight: "600", fontFamily, lineHeight: lh(11) },
  pointsWrap: { alignItems: "flex-end" },
  pointsVal: { fontWeight: "900", color: colors.primaryDark, fontSize: 16, fontFamily, lineHeight: lh(16) },
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
  actionBtnText: { fontSize: 15, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(15) },
});
