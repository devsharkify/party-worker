import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { LeaderboardEntry, LeaderboardView, OrgUnitType, PoolView } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { RowSkeleton } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { Feather } from "@expo/vector-icons";
import { colors, radius, shadow, tierColor } from "../../src/theme";

const LEVELS: OrgUnitType[] = ["booth", "mandal", "constituency", "district", "state"];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const MEDAL_BG: Record<number, string> = {
  1: "rgba(255,179,0,0.12)",
  2: "rgba(192,192,192,0.12)",
  3: "rgba(205,127,50,0.12)",
};

const L = {
  errorTitle: { te: "లీడర్‌బోర్డ్ లోడ్ కాలేదు", en: "Couldn't load the leaderboard" },
  emptyTitle: { te: "ర్యాంకింగ్‌లు లేవు", en: "No rankings yet" },
  emptyMsg: { te: "షేర్ చేసి పాయింట్లు సంపాదించండి.", en: "Share content to earn points and climb." },
  rankHere: { te: "ఈ స్థాయిలో మీ ర్యాంక్", en: "Your rank" },
};

export default function Leaderboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const [level, setLevel] = useState<OrgUnitType>("booth");
  const { data, loading, refreshing, error, reload, refresh } = useApi<LeaderboardView>(
    `/scoring/leaderboard?level=${level}`,
  );
  const pool = useApi<PoolView>("/scoring/pool");

  return (
    <View style={st.fill}>
      {/* Level chips */}
      <View style={st.chipsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.chipsContent}
        >
          {LEVELS.map((l) => {
            const active = level === l;
            return (
              <Pressable
                key={l}
                onPress={() => setLevel(l)}
                style={[st.chip, active && st.chipActive]}
              >
                <Text style={[st.chipText, active && st.chipTextActive]}>
                  {t(`leaderboard.${l}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Viewer rank banner */}
      {data ? (
        <View style={st.rankBanner}>
          <View style={st.rankBannerLeft}>
            <Feather name="map-pin" size={13} color={colors.primary} />
            <Text style={st.rankUnit} numberOfLines={1}>
              {data.orgUnitName}
            </Text>
          </View>
          <View style={st.rankPill}>
            <Text style={st.rankPillLabel}>{L.rankHere[lang] ?? L.rankHere.en}</Text>
            <Text style={st.rankPillValue}>#{data.viewerRank ?? "—"}</Text>
          </View>
        </View>
      ) : null}

      {loading && !data ? (
        <View style={st.listContent}>
          {[0, 1, 2, 3, 4].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </View>
      ) : error && !data ? (
        <StateView
          tone="error"
          title={L.errorTitle[lang] ?? L.errorTitle.en}
          message={error}
          retryLabel={t("common.retry")}
          onRetry={reload}
        />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(e) => e.userId}
          contentContainerStyle={st.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <StateView
              title={L.emptyTitle[lang] ?? L.emptyTitle.en}
              message={L.emptyMsg[lang] ?? L.emptyMsg.en}
            />
          }
          renderItem={({ item }) => (
            <Row entry={item} youLabel={t("leaderboard.you")} />
          )}
          ListFooterComponent={
            pool.data ? <PoolCard pool={pool.data} lang={lang} /> : null
          }
        />
      )}
    </View>
  );
}

function Row({ entry: e, youLabel }: { entry: LeaderboardEntry; youLabel: string }) {
  const tc = tierColor[e.tier] ?? colors.textMuted;
  const medal = MEDAL[e.rank];
  const medalBg = MEDAL_BG[e.rank];

  return (
    <View style={[
      st.row,
      e.isViewer && st.rowViewer,
      medalBg ? { backgroundColor: medalBg } : null,
    ]}>
      <View style={st.rankCol}>
        {medal ? (
          <Text style={st.medalEmoji}>{medal}</Text>
        ) : (
          <Text style={st.rank}>{e.rank}</Text>
        )}
      </View>
      <RemoteImage uri={e.photoUrl} width={44} height={44} radius={22} placeholderColor={colors.cardMuted} />
      <View style={{ flex: 1 }}>
        <View style={st.nameRow}>
          <Text style={[st.name, e.isViewer && st.nameViewer]} numberOfLines={1}>
            {e.name}
          </Text>
          {e.isViewer ? (
            <View style={st.youBadge}>
              <Text style={st.youBadgeText}>YOU</Text>
            </View>
          ) : null}
        </View>
        <View style={[st.tierChip, { backgroundColor: tc + "22" }]}>
          <View style={[st.tierDot, { backgroundColor: tc }]} />
          <Text style={[st.tier, { color: tc }]}>{e.tier}</Text>
        </View>
      </View>
      <View style={st.pointsCol}>
        <Text style={[st.points, e.isViewer && st.pointsViewer]}>
          {e.points.toLocaleString()}
        </Text>
        <Text style={st.pointsLabel}>pts</Text>
      </View>
    </View>
  );
}

function PoolCard({ pool, lang }: { pool: PoolView; lang: "te" | "en" }) {
  const promoteLabel = lang === "te"
    ? `టాప్ ${pool.promoteTop} ప్రమోట్`
    : `Top ${pool.promoteTop} promoted`;
  const demoteLabel = lang === "te"
    ? `బాటమ్ ${pool.demoteBottom} డిమోట్`
    : `Bottom ${pool.demoteBottom} demoted`;

  return (
    <View style={st.poolCard}>
      <View style={st.poolHeader}>
        <Text style={st.poolTitle}>{lang === "te" ? "మీ పూల్" : "Your Pool"}</Text>
        <Text style={st.poolSize}>
          {lang === "te" ? `${pool.size} మంది` : `${pool.size} members`}
        </Text>
      </View>

      {pool.viewerRank != null ? (
        <View style={st.poolRankRow}>
          <Text style={st.poolRankLabel}>{lang === "te" ? "పూల్ లో ర్యాంక్" : "Rank in pool"}</Text>
          <Text style={st.poolRankValue}>#{pool.viewerRank}</Text>
        </View>
      ) : null}

      <View style={st.poolThresholds}>
        <View style={st.poolThresholdChip}>
          <Text style={st.poolThresholdUp}>▲ {promoteLabel}</Text>
        </View>
        <View style={[st.poolThresholdChip, st.poolThresholdChipDown]}>
          <Text style={st.poolThresholdDown}>▼ {demoteLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#f8f4ff" },
  chipsBar: { backgroundColor: colors.navy },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMutedOnDark, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  rankBanner: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  rankBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  rankUnit: { color: "#fff", fontWeight: "700", fontSize: 14, flex: 1 },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(233,30,140,0.18)",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rankPillLabel: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: "600" },
  rankPillValue: { color: colors.primary, fontWeight: "900", fontSize: 16 },
  listContent: { padding: 14, paddingBottom: 32, gap: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  rowViewer: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primarySoft,
  },
  rankCol: { width: 34, alignItems: "center" },
  rank: { fontWeight: "800", color: colors.textMuted, fontSize: 17 },
  medalEmoji: { fontSize: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontWeight: "700", color: colors.text, fontSize: 15, flex: 1 },
  nameViewer: { color: colors.primaryDark },
  youBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  youBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  tierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  tierDot: { width: 7, height: 7, borderRadius: 4 },
  tier: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  pointsCol: { alignItems: "flex-end" },
  points: { fontWeight: "800", color: colors.navy, fontSize: 18 },
  pointsViewer: { color: colors.primaryDark },
  pointsLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },

  // Pool card
  poolCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
    ...shadow,
  },
  poolHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  poolTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  poolSize: { color: colors.textMutedOnDark, fontSize: 13, fontWeight: "600" },
  poolRankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  poolRankLabel: { color: colors.textMutedOnDark, fontSize: 13, fontWeight: "600" },
  poolRankValue: { color: colors.gold, fontWeight: "900", fontSize: 20 },
  poolThresholds: { flexDirection: "row", gap: 8 },
  poolThresholdChip: {
    flex: 1,
    backgroundColor: "rgba(34,197,94,0.14)",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  poolThresholdChipDown: { backgroundColor: "rgba(239,68,68,0.14)" },
  poolThresholdUp: { color: "#22c55e", fontSize: 12, fontWeight: "700" },
  poolThresholdDown: { color: "#ef4444", fontSize: 12, fontWeight: "700" },
});
