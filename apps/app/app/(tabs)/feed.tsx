import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Dimensions, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { Skeleton as MotiSkeleton } from "moti/skeleton";
import type { FeedItem, OrgMemberRow } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colors, radius, shadow, tierColor } from "../../src/theme";
import { useIsOnline } from "../../src/lib/offline";
import { useLeaderMode } from "../../src/hooks/useLeaderMode";

const SCREEN_W = Math.min(Dimensions.get("window").width, 480);
const GAP = 3;
const COLS = 3;
const TILE_SIZE = Math.floor((SCREEN_W - GAP * (COLS - 1)) / COLS);

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Tile({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const isVideo = item.type === "video";
  const isPersonalized = !!(item.personalizedUrl || item.personalizedVideoUrl);
  const uri = item.personalizedUrl ?? item.thumbnailUrl ?? item.sourceUrl;

  return (
    <Pressable
      style={({ pressed }) => [st.tile, pressed && { opacity: 0.80 }]}
      onPress={onPress}
    >
      <RemoteImage uri={uri} width={TILE_SIZE} height={TILE_SIZE} />

      {/* Video play icon top-right */}
      {isVideo && (
        <View style={st.videoIcon} pointerEvents="none">
          <Feather name="play" size={14} color="#fff" />
        </View>
      )}

      {/* Duration bottom-right */}
      {isVideo && item.videoDurationSec != null && (
        <View style={st.duration} pointerEvents="none">
          <Text style={st.durationText}>{formatDuration(item.videoDurationSec)}</Text>
        </View>
      )}

      {/* Personalized tick top-left */}
      {isPersonalized && (
        <View style={st.personalizedDot} pointerEvents="none">
          <Feather name="check" size={11} color="#fff" />
        </View>
      )}

      {/* NEW badge top-left (when not personalized) */}
      {item.isNew && !isPersonalized && (
        <View style={st.newBadge} pointerEvents="none">
          <Text style={st.newBadgeText}>NEW</Text>
        </View>
      )}

      {/* Bottom scrim + title */}
      <View style={st.scrim} pointerEvents="none">
        <Text style={st.tileTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );
}

function SkeletonGrid() {
  return (
    <View style={st.grid}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <MotiSkeleton
          key={i}
          colorMode="dark"
          width={TILE_SIZE}
          height={TILE_SIZE}
          radius={4}
        />
      ))}
    </View>
  );
}

function DashboardHeader({ name, items }: { name: string; items: number }) {
  return (
    <View style={st.dashHeader}>
      {/* Welcome row */}
      <View style={st.welcomeRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.welcomeGreeting}>Welcome back,</Text>
          <Text style={st.welcomeName} numberOfLines={1}>{name}</Text>
        </View>
        <View style={st.trsLogo}>
          <Text style={st.trsLogoText}>★ TRS</Text>
        </View>
      </View>

      {/* Stats card with LinearGradient */}
      <LinearGradient
        colors={["#E91E8C", "#AD1066"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={st.statsCard}
      >
        <View style={st.statsItem}>
          <Text style={st.statsValue}>{items}</Text>
          <Text style={st.statsLabel}>{items === 1 ? "Creative" : "Creatives"}</Text>
        </View>
        <View style={st.statsDivider} />
        <View style={st.statsItem}>
          <Text style={st.statsValue}>★</Text>
          <Text style={st.statsLabel}>Share Now</Text>
        </View>
      </LinearGradient>

      {/* Divider */}
      <View style={st.dashDivider} />

      {/* Section label */}
      <View style={st.sectionLabelRow}>
        <Feather name="grid" size={14} color={colors.primary} />
        <Text style={st.sectionLabel}>Campaign Creatives</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Leader mode toggle pill
// ---------------------------------------------------------------------------
function LeaderModeToggle({
  mode,
  onToggle,
}: {
  mode: "worker" | "leader";
  onToggle: (next: "worker" | "leader") => void;
}) {
  return (
    <View style={lt.wrap}>
      <Pressable
        style={[lt.pill, mode === "worker" && lt.pillActive]}
        onPress={() => onToggle("worker")}
      >
        <Feather name="user" size={13} color={mode === "worker" ? "#fff" : colors.textMuted} />
        <Text style={[lt.pillText, mode === "worker" && lt.pillTextActive]}>Worker Mode</Text>
      </Pressable>
      <Pressable
        style={[lt.pill, mode === "leader" && lt.pillLeaderActive]}
        onPress={() => onToggle("leader")}
      >
        <Feather name="star" size={13} color={mode === "leader" ? "#fff" : colors.textMuted} />
        <Text style={[lt.pillText, mode === "leader" && lt.pillTextActive]}>Leader Mode</Text>
      </Pressable>
    </View>
  );
}

const lt = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "#eee",
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: 12,
    marginTop: 4,
    gap: 2,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  pillActive: { backgroundColor: colors.navy },
  pillLeaderActive: { backgroundColor: colors.primary },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  pillTextActive: { color: "#fff" },
});

// ---------------------------------------------------------------------------
// Leader dashboard
// ---------------------------------------------------------------------------
function TopPerformerRow({ member, rank }: { member: OrgMemberRow; rank: number }) {
  const tierC = tierColor[member.tier] ?? colors.textMuted;
  const initial = member.name.trim().charAt(0).toUpperCase() || "?";
  const rankColors = ["#FFB300", "#94a3b8", "#fb923c"];
  const rankColor = rankColors[rank - 1] ?? colors.textMuted;
  return (
    <View style={ld.performerRow}>
      <View style={[ld.rankBadge, { backgroundColor: rankColor + "22", borderColor: rankColor }]}>
        <Text style={[ld.rankText, { color: rankColor }]}>{rank}</Text>
      </View>
      <View style={[ld.avatarFallback, { backgroundColor: tierC + "22" }]}>
        <Text style={[ld.avatarInitial, { color: tierC }]}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ld.performerName} numberOfLines={1}>{member.name}</Text>
        {member.designation ? (
          <Text style={ld.performerDesig} numberOfLines={1}>{member.designation}</Text>
        ) : null}
      </View>
      <View style={ld.pointsWrap}>
        <Text style={ld.pointsVal}>{member.weeklyLeaguePoints}</Text>
        <Text style={ld.pointsLabel}>pts</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item }: { item: { id: string; type: string; points: number; createdAt: string; label: string } }) {
  const iconMap: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
    share: "share-2",
    grievance: "alert-circle",
    checkin: "check-square",
  };
  const icon = iconMap[item.type] ?? "activity";
  const ago = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000);
  const agoLabel = ago < 1 ? "just now" : ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`;
  return (
    <View style={ld.activityRow}>
      <View style={ld.activityIcon}>
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <Text style={ld.activityLabel} numberOfLines={1}>{item.label}</Text>
      <Text style={ld.activityMeta}>{agoLabel}</Text>
      <Text style={ld.activityPts}>+{item.points}</Text>
    </View>
  );
}

function LeaderDashboard({
  user,
  router,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  router: ReturnType<typeof useRouter>;
}) {
  const orgUnitId = user.orgUnitId;
  const members = useApi<OrgMemberRow[]>(orgUnitId ? `/org/units/${orgUnitId}/members` : null);
  const activity = useApi<{ id: string; type: string; points: number; createdAt: string; label: string }[]>(
    "/me/activity",
  );

  const totalMembers = members.data?.length ?? 0;
  const activeThisWeek = members.data?.filter((m) => m.weeklyLeaguePoints > 0).length ?? 0;
  const topThree = [...(members.data ?? [])].sort((a, b) => b.weeklyLeaguePoints - a.weeklyLeaguePoints).slice(0, 3);

  return (
    <ScrollView style={ld.fill} contentContainerStyle={ld.content} showsVerticalScrollIndicator={false}>

      {/* My Team summary */}
      <LinearGradient
        colors={[colors.navy, "#2a1a3e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ld.teamCard}
      >
        <View style={ld.teamCardHeader}>
          <Feather name="users" size={18} color={colors.gold} />
          <Text style={ld.teamCardTitle}>My Team</Text>
        </View>
        <Text style={ld.teamUnitName} numberOfLines={1}>{user.orgUnitName}</Text>

        {members.loading && !members.data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : (
          <View style={ld.teamStats}>
            <View style={ld.teamStat}>
              <Text style={ld.teamStatValue}>{totalMembers}</Text>
              <Text style={ld.teamStatLabel}>Total Members</Text>
            </View>
            <View style={ld.teamStatDivider} />
            <View style={ld.teamStat}>
              <Text style={ld.teamStatValue}>{activeThisWeek}</Text>
              <Text style={ld.teamStatLabel}>Active This Week</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Top performers */}
      <View style={ld.sectionHeader}>
        <Feather name="trending-up" size={15} color={colors.gold} />
        <Text style={ld.sectionTitle}>Top Performers</Text>
      </View>
      <View style={ld.card}>
        {members.loading && !members.data ? (
          <ActivityIndicator color={colors.primary} />
        ) : topThree.length === 0 ? (
          <Text style={ld.emptyMsg}>No members yet in your unit.</Text>
        ) : (
          topThree.map((m, i) => <TopPerformerRow key={m.id} member={m} rank={i + 1} />)
        )}
      </View>

      {/* Recent activity feed */}
      <View style={ld.sectionHeader}>
        <Feather name="activity" size={15} color={colors.primary} />
        <Text style={ld.sectionTitle}>Recent Activity</Text>
      </View>
      <View style={ld.card}>
        {activity.loading && !activity.data ? (
          <ActivityIndicator color={colors.primary} />
        ) : (activity.data ?? []).length === 0 ? (
          <Text style={ld.emptyMsg}>No recent activity.</Text>
        ) : (
          (activity.data ?? []).slice(0, 5).map((item) => <ActivityRow key={item.id} item={item} />)
        )}
      </View>

      {/* Action buttons */}
      <View style={ld.actionRow}>
        <Pressable
          style={({ pressed }) => [ld.actionBtn, ld.actionBtnPrimary, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/(tabs)/team")}
        >
          <Feather name="user-plus" size={16} color="#fff" />
          <Text style={ld.actionBtnText}>Onboard New Member</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [ld.actionBtn, ld.actionBtnSecondary, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/(tabs)/team")}
        >
          <Feather name="users" size={16} color={colors.primary} />
          <Text style={[ld.actionBtnText, { color: colors.primary }]}>View Full Team</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const ld = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  content: { padding: 16, paddingBottom: 40 },

  teamCard: {
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 20,
    ...shadow,
  },
  teamCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  teamCardTitle: { fontSize: 16, fontWeight: "800", color: colors.gold, letterSpacing: 0.3 },
  teamUnitName: { fontSize: 13, color: colors.textMutedOnDark, fontWeight: "600", marginBottom: 14 },
  teamStats: { flexDirection: "row", alignItems: "center" },
  teamStat: { flex: 1, alignItems: "center" },
  teamStatValue: { fontSize: 28, fontWeight: "900", color: "#fff" },
  teamStatLabel: { fontSize: 12, color: colors.textMutedOnDark, fontWeight: "600", marginTop: 2 },
  teamStatDivider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.2)" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 },

  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  emptyMsg: { color: colors.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 8 },

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
  rankText: { fontSize: 12, fontWeight: "900" },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontWeight: "800" },
  performerName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  performerDesig: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  pointsWrap: { alignItems: "flex-end" },
  pointsVal: { fontWeight: "900", color: colors.primaryDark, fontSize: 16 },
  pointsLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },

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
  activityLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },
  activityMeta: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  activityPts: { fontSize: 13, fontWeight: "800", color: colors.success, minWidth: 30, textAlign: "right" },

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
  actionBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// ---------------------------------------------------------------------------
// Feed (worker view)
// ---------------------------------------------------------------------------

export default function Feed() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const router = useRouter();
  const { user } = useAuth();
  const { data, loading, refreshing, error, reload, refresh } = useApi<FeedItem[]>("/feed");
  const isOnline = useIsOnline();
  const { mode, setMode, ready } = useLeaderMode();

  const firstName = user?.name?.split(" ")[0] ?? "Worker";

  // Leader mode — show leader dashboard instead of worker feed
  if (user?.isLeader && ready && mode === "leader") {
    return (
      <View style={st.fill}>
        {!isOnline && (
          <View style={st.offlineBanner}>
            <Feather name="wifi-off" size={13} color="#92400e" />
            <Text style={st.offlineBannerText}>Offline — Cached content</Text>
          </View>
        )}
        <View style={st.leaderToggleBar}>
          <Text style={st.leaderHello}>Leader Dashboard</Text>
          <LeaderModeToggle mode={mode} onToggle={setMode} />
        </View>
        <LeaderDashboard user={user} router={router} />
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={st.fill}>
        {user?.isLeader && ready && (
          <View style={st.leaderToggleBar}>
            <Text style={st.leaderHello}>Worker Mode</Text>
            <LeaderModeToggle mode={mode} onToggle={setMode} />
          </View>
        )}
        <DashboardHeader name={firstName} items={0} />
        <SkeletonGrid />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={st.fill}>
        {user?.isLeader && ready && (
          <View style={st.leaderToggleBar}>
            <Text style={st.leaderHello}>Worker Mode</Text>
            <LeaderModeToggle mode={mode} onToggle={setMode} />
          </View>
        )}
        <StateView
          tone="error"
          title="Couldn't load feed"
          message={error}
          retryLabel={t("common.retry")}
          onRetry={reload}
        />
      </View>
    );
  }

  // Build rows of 3 for FlatList
  const items = data ?? [];
  type Row = [FeedItem, FeedItem | null, FeedItem | null];
  const rows: Row[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push([items[i], items[i + 1] ?? null, items[i + 2] ?? null]);
  }

  return (
    <View style={st.fill}>
      {!isOnline && (
        <View style={st.offlineBanner}>
          <Feather name="wifi-off" size={13} color="#92400e" />
          <Text style={st.offlineBannerText}>Offline — Cached content</Text>
        </View>
      )}
      {user?.isLeader && ready && (
        <View style={st.leaderToggleBar}>
          <LeaderModeToggle mode={mode} onToggle={setMode} />
        </View>
      )}
      <FlatList
        style={st.list}
        contentContainerStyle={{ flexGrow: 1 }}
        data={rows}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <DashboardHeader name={firstName} items={items.length} />
        }
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <Feather name="image" size={40} color={colors.primary} style={{ opacity: 0.5 }} />
            <Text style={st.emptyTitle}>Nothing here yet</Text>
            <Text style={st.emptySub}>{t("feed.empty")}</Text>
          </View>
        }
        renderItem={({ item: [a, b, c], index }) => (
          <View style={st.row}>
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 400, delay: (index * 3) * 80 }}
            >
              <Tile item={a} onPress={() => router.push(`/personalize/${a.creativeId}`)} />
            </MotiView>
            {b ? (
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 400, delay: (index * 3 + 1) * 80 }}
              >
                <Tile item={b} onPress={() => router.push(`/personalize/${b.creativeId}`)} />
              </MotiView>
            ) : <View style={st.tilePlaceholder} />}
            {c ? (
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 400, delay: (index * 3 + 2) * 80 }}
              >
                <Tile item={c} onPress={() => router.push(`/personalize/${c.creativeId}`)} />
              </MotiView>
            ) : <View style={st.tilePlaceholder} />}
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  list: { flex: 1, backgroundColor: colors.navy },
  leaderToggleBar: {
    backgroundColor: colors.navy,
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  leaderHello: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMutedOnDark,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  offlineBannerText: { fontSize: 13, fontWeight: "600", color: "#92400e" },

  // Dashboard header
  dashHeader: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  welcomeGreeting: {
    fontSize: 13,
    color: colors.textMutedOnDark,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  welcomeName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  trsLogo: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  trsLogoText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  dashSub: {
    fontSize: 13,
    color: colors.textMutedOnDark,
    fontWeight: "500",
    marginBottom: 12,
  },
  statsCard: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  statsItem: {
    flex: 1,
    alignItems: "center",
  },
  statsValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  statsLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  statsDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dashDivider: {
    height: 1,
    backgroundColor: colors.borderOnDark,
    marginBottom: 12,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, padding: GAP },
  row: { flexDirection: "row", gap: GAP, marginBottom: GAP },

  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: "#1c1c1c",
    overflow: "hidden",
    position: "relative",
  },
  tilePlaceholder: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: "transparent",
  },

  // Video indicator top-right
  videoIcon: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  // Duration bottom-right
  duration: {
    position: "absolute",
    bottom: 38,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Personalized tick top-left
  personalizedDot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // NEW badge top-left
  newBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#EF4444",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  newBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },

  // Bottom scrim + title
  scrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  tileTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14 },

  // Empty state
  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  emptySub: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20 },
});
