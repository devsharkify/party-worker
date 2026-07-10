import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { colors, fontFamily, lh, radius } from "../../src/theme";
import type { Survey } from "../../src/lib/voters";

const SUPPORT_LABELS: Record<string, { te: string; en: string; color: string }> = {
  strong: { te: "బలమైన మద్దతు", en: "Strong", color: "#2B8A3E" },
  leaning: { te: "మొగ్గు", en: "Leaning", color: "#5C940D" },
  neutral: { te: "న్యూట్రల్", en: "Neutral", color: "#E8A820" },
  opposed: { te: "వ్యతిరేకం", en: "Opposed", color: "#C92A2A" },
};

/** My submitted household surveys. */
export default function MySurveys() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setSurveys(await api<Survey[]>("/voters/surveys/mine"));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function formatDate(s: Survey): string {
    const raw = s.visitDate ?? s.createdAt;
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang === "te" ? "te-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const title = lang === "te" ? "నా సర్వేలు" : "My Surveys";

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={76} rounded={radius.lg} style={{ marginBottom: 10 }} />
          ))}
        </View>
      ) : error ? (
        <StateView
          glyph="⚠️"
          tone="error"
          title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
          message={error}
          retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
          onRetry={() => void load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {surveys.length === 0 ? (
            <StateView
              glyph="📋"
              title={lang === "te" ? "ఇంకా సర్వేలు లేవు" : "No surveys yet"}
              message={
                lang === "te"
                  ? "కుటుంబాలను సర్వే చేసి పాయింట్లు సంపాదించండి"
                  : "Survey households to earn points"
              }
              retryLabel={lang === "te" ? "కొత్త సర్వే" : "New survey"}
              onRetry={() => router.push("/voters/survey")}
            />
          ) : (
            surveys.map((s) => {
              const sl = s.supportLevel ? SUPPORT_LABELS[s.supportLevel] : undefined;
              return (
                <View key={s.id} style={st.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.name} numberOfLines={1}>
                      {s.householdName}
                    </Text>
                    <Text style={st.meta}>
                      {s.familyMembersCount} {lang === "te" ? "సభ్యులు" : "members"}
                      {formatDate(s) ? `  ·  ${formatDate(s)}` : ""}
                    </Text>
                  </View>
                  {sl ? (
                    <View style={[st.supportChip, { backgroundColor: sl.color }]}>
                      <Text style={st.supportChipText}>{sl[lang]}</Text>
                    </View>
                  ) : s.supportLevel ? (
                    <View style={[st.supportChip, { backgroundColor: colors.textMuted }]}>
                      <Text style={st.supportChipText}>{s.supportLevel}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  meta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 2 },
  supportChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  supportChipText: { color: "#fff", fontSize: 11, fontWeight: "700", fontFamily, lineHeight: lh(11) },
});
