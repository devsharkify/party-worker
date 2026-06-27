import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Skeleton as MotiSkeleton } from "moti/skeleton";
import type { FeedItem, MissionView } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { BannerShareModal } from "../../src/components/BannerShareModal";
import { MissionBanner } from "../../src/components/MissionBanner";
import { colors, fontFamily, lh, radius, shadow, shadowLg } from "../../src/theme";
import { useIsOnline } from "../../src/lib/offline";

const SCREEN_W = Math.min(Dimensions.get("window").width, 480);
const GAP = 3;
const COLS = 3;
const TILE_SIZE = Math.floor((SCREEN_W - GAP * (COLS - 1)) / COLS);

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Tile({ item, onPress, onShare }: { item: FeedItem; onPress: () => void; onShare: () => void }) {
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

      {/* BREAKING badge — highest priority, shown over everything */}
      {item.isBreaking && (
        <View style={st.breakingBadge} pointerEvents="none">
          <Text style={st.breakingBadgeText}>🚨 BREAKING</Text>
        </View>
      )}

      {/* NEW badge top-left (when not personalized and not breaking) */}
      {item.isNew && !isPersonalized && !item.isBreaking && (
        <View style={st.newBadge} pointerEvents="none">
          <Text style={st.newBadgeText}>NEW</Text>
        </View>
      )}

      {/* Bottom scrim + title */}
      <View style={st.scrim} pointerEvents="none">
        <Text style={st.tileTitle} numberOfLines={2}>{item.title}</Text>
      </View>

      {/* Share button — bottom-right above scrim */}
      <Pressable
        style={({ pressed }) => [st.shareBtn, pressed && { opacity: 0.75 }]}
        onPress={(e) => { e.stopPropagation?.(); onShare(); }}
        hitSlop={4}
      >
        <Feather name="instagram" size={12} color="#fff" />
      </Pressable>
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

function DashboardHeader({ name, items, lang }: { name: string; items: number; lang: "te" | "en" }) {
  return (
    <View style={st.dashHeader}>
      {/* Welcome row */}
      <View style={st.welcomeRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.welcomeGreeting}>{lang === "te" ? "తిరిగి స్వాగతం" : "WELCOME BACK"}</Text>
          <Text style={st.welcomeName} numberOfLines={1}>{name}</Text>
        </View>
      </View>

      {/* Stats hero — deep navy with subtle navy gradient and gold accent line */}
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={st.statsCard}
      >
        <View style={st.statsGoldLine} />
        <View style={st.statsItem}>
          <Text style={st.statsValue}>{items}</Text>
          <Text style={st.statsLabel}>{lang === "te" ? "పోస్టర్లు" : items === 1 ? "CREATIVE" : "CREATIVES"}</Text>
        </View>
        <View style={st.statsDivider} />
        <View style={st.statsItem}>
          <Feather name="share-2" size={18} color={colors.gold} />
          <Text style={[st.statsLabel, { marginTop: 6 }]}>{lang === "te" ? "షేర్ చేయడానికి సిద్ధం" : "READY TO SHARE"}</Text>
        </View>
      </LinearGradient>

      {/* Section label */}
      <View style={st.sectionLabelRow}>
        <View style={st.sectionAccent} />
        <Text style={st.sectionLabel}>{lang === "te" ? "ప్రచార పోస్టర్లు" : "Campaign Creatives"}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feed (worker view)
// ---------------------------------------------------------------------------

export default function Feed() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const router = useRouter();
  const { user, api } = useAuth();
  const { data, loading, refreshing, error, reload, refresh } = useApi<FeedItem[]>("/feed");
  const { data: missions, reload: reloadMissions } = useApi<MissionView[]>("/missions");
  const { data: crisisAlerts } = useApi<{ id: string; title: string; message: string }[]>("/crisis/active");
  const isOnline = useIsOnline();

  const firstName = user?.name?.split(" ")[0] ?? "Worker";
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);

  if (loading && !data) {
    return (
      <View style={st.fill}>
        <DashboardHeader name={firstName} items={0} lang={lang} />
        <SkeletonGrid />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={st.fill}>
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

  const bannerUser = user ? {
    id: user.id,
    name: user.name,
    designation: user.designation,
    photoUrl: user.photoUrl,
    tier: user.tier,
    area: user.area,
    boothName: user.boothName,
    orgUnitName: user.orgUnitName,
    weeklyLeaguePoints: user.weeklyLeaguePoints,
    lifetimeReputation: user.lifetimeReputation,
  } : null;

  return (
    <View style={st.fill}>
      {(crisisAlerts ?? []).map((alert) => (
        <View key={alert.id} style={st.crisisBanner}>
          <Text style={st.crisisIcon}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.crisisTitle} numberOfLines={1}>{alert.title}</Text>
            <Text style={st.crisisMsg} numberOfLines={2}>{alert.message}</Text>
          </View>
        </View>
      ))}
      {!isOnline && (
        <View style={st.offlineBanner}>
          <Feather name="wifi-off" size={13} color="#92400e" />
          <Text style={st.offlineBannerText}>{lang === "te" ? "ఆఫ్‌లైన్ — సేవ్ చేసిన కంటెంట్" : "Offline — Cached content"}</Text>
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
          <>
            <DashboardHeader name={firstName} items={items.length} lang={lang} />
            {missions && missions.length > 0 ? (
              <MissionBanner
                missions={missions}
                onComplete={async (missionId) => {
                  try {
                    await api<{ pointsAwarded: number }>(`/missions/${missionId}/complete`, {
                      method: "POST",
                    });
                    reloadMissions();
                  } catch {
                    // Non-fatal
                  }
                }}
              />
            ) : null}
            {/* Voter Connect quick action */}
            <Pressable
              onPress={() => router.push("/voter-connect")}
              style={({ pressed }) => [st.voterConnectCard, pressed && { opacity: 0.8 }]}
            >
              <View style={st.voterConnectIcon}>
                <Feather name="user-plus" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.voterConnectTitle}>{lang === "te" ? "ఓటరు నమోదు" : "Voter Connect"}</Text>
                <Text style={st.voterConnectSub}>{lang === "te" ? "ఓటర్లను నమోదు చేయండి · +5 పాయింట్లు" : "Register a voter · +5 pts"}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <Feather name="image" size={40} color={colors.primary} style={{ opacity: 0.5 }} />
            <Text style={st.emptyTitle}>{lang === "te" ? "ఇంకా ఏమీ లేదు" : "Nothing here yet"}</Text>
            <Text style={st.emptySub}>{t("feed.empty")}</Text>
          </View>
        }
        renderItem={({ item: [a, b, c] }) => (
          <View style={st.row}>
            <Tile item={a} onPress={() => router.push(`/personalize/${a.creativeId}`)} onShare={() => setShareItem(a)} />
            {b ? (
              <Tile item={b} onPress={() => router.push(`/personalize/${b.creativeId}`)} onShare={() => setShareItem(b)} />
            ) : <View style={st.tilePlaceholder} />}
            {c ? (
              <Tile item={c} onPress={() => router.push(`/personalize/${c.creativeId}`)} onShare={() => setShareItem(c)} />
            ) : <View style={st.tilePlaceholder} />}
          </View>
        )}
      />

      {/* Banner share modal — shown when worker taps IG icon on a tile */}
      {bannerUser && (
        <BannerShareModal
          item={shareItem}
          visible={shareItem !== null}
          onClose={() => setShareItem(null)}
          user={bannerUser}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.primaryDark },
  list: { flex: 1, backgroundColor: colors.primaryDark },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.goldSoft,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  offlineBannerText: { fontSize: 13, fontWeight: "600", color: colors.goldDark, fontFamily, lineHeight: lh(13) },
  crisisBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#7f1d1d", paddingHorizontal: 14, paddingVertical: 10 },
  crisisIcon: { fontSize: 18 },
  crisisTitle: { fontSize: 13, fontWeight: "900", color: "#fca5a5", fontFamily, lineHeight: lh(13) },
  crisisMsg: { fontSize: 12, color: "#fecaca", fontFamily, lineHeight: lh(12), marginTop: 2 },
  voterConnectCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  voterConnectIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" },
  voterConnectTitle: { fontSize: 14, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(14) },
  voterConnectSub: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 2 },

  // Dashboard header — deep navy with gold accent line
  dashHeader: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  welcomeGreeting: {
    fontSize: 10,
    color: colors.gold,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 4,
    fontFamily,
    lineHeight: lh(10),
  },
  welcomeName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.4,
    fontFamily,
    lineHeight: lh(24),
  },
  statsCard: {
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(232,168,32,0.25)",
    position: "relative",
    overflow: "hidden",
  },
  statsGoldLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.gold,
  },
  statsItem: {
    flex: 1,
    alignItems: "center",
  },
  statsValue: {
    color: colors.gold,
    fontSize: 32,
    fontWeight: "900",
    fontFamily,
    lineHeight: lh(32),
    letterSpacing: -0.5,
  },
  statsLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 6,
    letterSpacing: 1.2,
    fontFamily,
    lineHeight: lh(10),
  },
  statsDivider: {
    width: 1,
    height: 44,
    backgroundColor: "rgba(232,168,32,0.25)",
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    fontFamily,
    lineHeight: lh(13),
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
  durationText: { color: "#fff", fontSize: 11, fontWeight: "700", fontFamily, lineHeight: lh(11) },

  // Personalized tick top-left
  personalizedDot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },

  // BREAKING badge — red pill, always top-left
  breakingBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.danger,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  breakingBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5, fontFamily, lineHeight: lh(8) },

  // NEW badge top-left — gold pill with navy text for premium feel
  newBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.gold,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  newBadgeText: { color: colors.primaryDark, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, fontFamily, lineHeight: lh(9) },

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
  tileTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14, fontFamily },

  // Share (Instagram) button — bottom-right corner of tile, gold accent
  shareBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(15,31,78,0.9)",
  },

  // Empty state
  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(18) },
  emptySub: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20, fontFamily },
});
