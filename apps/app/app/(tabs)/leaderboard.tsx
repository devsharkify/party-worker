import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { LeaderboardView, OrgUnitType } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { colors, radius, tierColor } from "../../src/theme";

const LEVELS: OrgUnitType[] = ["booth", "mandal", "constituency", "district", "state"];

export default function Leaderboard() {
  const { t } = useTranslation();
  const [level, setLevel] = useState<OrgUnitType>("booth");
  const { data, loading } = useApi<LeaderboardView>(`/scoring/leaderboard?level=${level}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.cardMuted }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.chips}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}
      >
        {LEVELS.map((l) => (
          <Pressable
            key={l}
            onPress={() => setLevel(l)}
            style={[st.chip, level === l && st.chipActive]}
          >
            <Text style={[st.chipText, level === l && st.chipTextActive]}>{t(`leaderboard.${l}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {data ? (
        <View style={st.rankBanner}>
          <Text style={st.rankBannerText}>
            {data.orgUnitName} · {t("leaderboard.rank")} #{data.viewerRank ?? "-"}
          </Text>
        </View>
      ) : null}

      {loading && !data ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          {(data?.entries ?? []).map((e) => (
            <View key={e.userId} style={[st.row, e.isViewer && st.rowViewer]}>
              <Text style={st.rank}>{e.rank}</Text>
              <Image source={{ uri: e.photoUrl ?? undefined }} style={st.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={st.name}>
                  {e.name} {e.isViewer ? `(${t("leaderboard.you")})` : ""}
                </Text>
                <Text style={[st.tier, { color: tierColor[e.tier] ?? colors.textMuted }]}>
                  {e.tier}
                </Text>
              </View>
              <Text style={st.points}>{e.points}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { maxHeight: 56, backgroundColor: colors.bg },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.textMutedOnDark },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMutedOnDark, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  rankBanner: { backgroundColor: colors.bgElevated, padding: 12, alignItems: "center" },
  rankBannerText: { color: colors.gold, fontWeight: "800", fontSize: 15 },
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
  },
  rowViewer: { borderColor: colors.primary, borderWidth: 2 },
  rank: { width: 28, textAlign: "center", fontWeight: "800", color: colors.textMuted, fontSize: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardMuted },
  name: { fontWeight: "700", color: colors.text },
  tier: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  points: { fontWeight: "800", color: colors.primaryDark, fontSize: 16 },
});
