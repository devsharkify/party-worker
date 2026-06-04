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
import type { LeaderboardEntry, LeaderboardView, OrgUnitType } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { RowSkeleton } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colors, radius, shadow, tierColor } from "../../src/theme";

const LEVELS: OrgUnitType[] = ["booth", "mandal", "constituency", "district", "state"];
const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const L = {
  errorTitle: { te: "లీడర్‌బోర్డ్ లోడ్ కాలేదు", en: "Couldn’t load the leaderboard" },
  emptyTitle: { te: "ర్యాంకింగ్‌లు లేవు", en: "No rankings yet" },
  emptyMsg: { te: "షేర్ చేసి పాయింట్లు సంపాదించండి.", en: "Share content to earn points and climb." },
  rankHere: { te: "ఈ స్థాయిలో మీ ర్యాంక్", en: "Your rank here" },
};

export default function Leaderboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const [level, setLevel] = useState<OrgUnitType>("booth");
  const { data, loading, refreshing, error, reload, refresh } = useApi<LeaderboardView>(
    `/scoring/leaderboard?level=${level}`,
  );

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
          <Text style={st.rankUnit} numberOfLines={1}>
            {data.orgUnitName}
          </Text>
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
          glyph="⚠️"
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
              glyph="🏆"
              title={L.emptyTitle[lang] ?? L.emptyTitle.en}
              message={L.emptyMsg[lang] ?? L.emptyMsg.en}
            />
          }
          renderItem={({ item }) => (
            <Row entry={item} youLabel={t("leaderboard.you")} />
          )}
        />
      )}
    </View>
  );
}

function Row({ entry: e, youLabel }: { entry: LeaderboardEntry; youLabel: string }) {
  const tc = tierColor[e.tier] ?? colors.textMuted;
  const medal = MEDAL[e.rank];
  return (
    <View style={[st.row, e.isViewer && st.rowViewer]}>
      <View style={st.rankCol}>
        {medal ? (
          <Text style={st.medal}>{medal}</Text>
        ) : (
          <Text style={st.rank}>{e.rank}</Text>
        )}
      </View>
      <RemoteImage uri={e.photoUrl} width={42} height={42} radius={21} placeholderColor={colors.cardMuted} />
      <View style={{ flex: 1 }}>
        <Text style={st.name} numberOfLines={1}>
          {e.name}
          {e.isViewer ? <Text style={st.youTag}>  · {youLabel}</Text> : null}
        </Text>
        <View style={[st.tierChip, { backgroundColor: tc + "22" }]}>
          <Text style={[st.tier, { color: tc }]}>{e.tier}</Text>
        </View>
      </View>
      <Text style={st.points}>{e.points.toLocaleString()}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  chipsBar: { backgroundColor: colors.bg },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMutedOnDark, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  rankBanner: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rankUnit: { color: "#fff", fontWeight: "800", fontSize: 15, flex: 1 },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,213,74,0.14)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rankPillLabel: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: "600" },
  rankPillValue: { color: colors.gold, fontWeight: "800", fontSize: 16 },
  listContent: { padding: 14, paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  rowViewer: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  rankCol: { width: 30, alignItems: "center" },
  rank: { fontWeight: "800", color: colors.textMuted, fontSize: 16 },
  medal: { fontSize: 22 },
  name: { fontWeight: "700", color: colors.text, fontSize: 15 },
  youTag: { color: colors.primaryDark, fontWeight: "800" },
  tierChip: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  tier: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  points: { fontWeight: "800", color: colors.primaryDark, fontSize: 17 },
});
