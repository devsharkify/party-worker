import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useApi } from "../src/hooks";
import { StateView } from "../src/components/StateView";
import { SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

interface MySubmission {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

const L = {
  title: { te: "నా సమర్పణలు", en: "My submissions" },
  empty: { te: "ఇంకా ఏమీ పంపలేదు", en: "Nothing submitted yet" },
  emptyHint: {
    te: "మీ ప్రాంత ఫోటో/వీడియో పంపండి — ఆమోదం తర్వాత అందరి ఫీడ్‌లో కనిపిస్తుంది.",
    en: "Send a photo/video from your area — it reaches everyone's feed after approval.",
  },
  submitNew: { te: "కొత్తది పంపండి", en: "Submit new" },
  pending: { te: "సమీక్షలో", en: "In review" },
  approved: { te: "ఆమోదించబడింది", en: "Approved" },
  rejected: { te: "తిరస్కరించబడింది", en: "Rejected" },
  noteLabel: { te: "సమీక్షకుల గమనిక:", en: "Reviewer note:" },
};

const STATUS_STYLE: Record<MySubmission["status"], { bg: string; fg: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E" },
  approved: { bg: "#DCFCE7", fg: "#166534" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
};

function timeAgo(iso: string, lang: "te" | "en") {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return lang === "te" ? `${d} రోజుల క్రితం` : `${d}d ago`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return lang === "te" ? `${h} గం. క్రితం` : `${h}h ago`;
  return lang === "te" ? "ఇప్పుడే" : "Just now";
}

export default function MySubmissionsScreen() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: keyof typeof L) => L[k][lang] ?? L[k].en;
  const router = useRouter();
  const subs = useApi<MySubmission[]>("/creatives/submissions/mine");

  if (subs.error) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: ll("title") }} />
        <StateView tone="error" title={ll("title")} message={subs.error} onRetry={() => void subs.reload()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={st.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={subs.refreshing} onRefresh={() => void subs.refresh()} />
      }
    >
      <Stack.Screen options={{ title: ll("title") }} />

      <Pressable
        onPress={() => router.push("/submit-content")}
        style={({ pressed }) => [st.newBtn, pressed && { opacity: 0.85 }]}
      >
        <Feather name="plus" size={16} color="#fff" />
        <Text style={st.newBtnText}>{ll("submitNew")}</Text>
      </Pressable>

      {subs.loading ? (
        [0, 1, 2].map((i) => (
          <SkeletonBlock key={i} height={86} rounded={radius.lg} style={{ marginBottom: 10 }} />
        ))
      ) : !subs.data || subs.data.length === 0 ? (
        <View style={st.emptyBox}>
          <Feather name="inbox" size={30} color={colors.textMuted} />
          <Text style={st.emptyTitle}>{ll("empty")}</Text>
          <Text style={st.emptyHint}>{ll("emptyHint")}</Text>
        </View>
      ) : (
        subs.data.map((s) => {
          const chip = STATUS_STYLE[s.status];
          return (
            <View key={s.id} style={[st.card, shadow]}>
              <View style={st.thumbWrap}>
                {s.thumbnailUrl ? (
                  <Image source={{ uri: s.thumbnailUrl }} style={st.thumb} contentFit="cover" />
                ) : (
                  <View style={[st.thumb, st.thumbFallback]}>
                    <Feather name="film" size={18} color={colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle} numberOfLines={2}>
                  {s.title}
                </Text>
                <Text style={st.cardTime}>{timeAgo(s.createdAt, lang)}</Text>
                {s.status === "rejected" && s.reviewNote ? (
                  <Text style={st.note} numberOfLines={3}>
                    {ll("noteLabel")} {s.reviewNote}
                  </Text>
                ) : null}
              </View>
              <View style={[st.chip, { backgroundColor: chip.bg }]}>
                <Text style={[st.chipText, { color: chip.fg }]}>{ll(s.status)}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 46,
    marginBottom: 16,
    ...shadow,
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily, lineHeight: lh(15) },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { fontWeight: "700", fontSize: 16, color: colors.text, fontFamily, lineHeight: lh(16) },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 24, fontFamily },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  thumbWrap: { borderRadius: radius.md, overflow: "hidden" },
  thumb: { width: 56, height: 56, backgroundColor: colors.bg },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily, lineHeight: lh(14) },
  cardTime: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily },
  note: { color: "#991B1B", fontSize: 12, marginTop: 4, lineHeight: 17, fontFamily },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontWeight: "700", fontSize: 11, fontFamily },
});
