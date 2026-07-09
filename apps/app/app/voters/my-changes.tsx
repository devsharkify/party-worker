import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { RowSkeleton } from "../../src/components/Skeleton";
import { ChangeChips } from "../../src/components/ChangeChips";
import { colors, fontFamily, lh, radius } from "../../src/theme";
import { timeAgo } from "../../src/lib/field";
import type { MyChangeEntry } from "../../src/lib/voters";

/** My edit history — every voter change I made, newest first. */
export default function MyChangesScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [entries, setEntries] = useState<MyChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setEntries(await api<MyChangeEntry[]>("/voters/changes/mine"));
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

  const title = lang === "te" ? "నా మార్పులు" : "My Changes";

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      {error && entries.length === 0 ? (
        <StateView
          glyph="⚠️"
          tone="error"
          title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
          message={error}
          retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
          onRetry={() => void load()}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/voters/${item.voter.id}`)}
              style={({ pressed }) => [st.card, pressed && { opacity: 0.8 }]}
            >
              <View style={st.cardTop}>
                <Text style={st.voterName} numberOfLines={1}>
                  {lang === "te" && item.voter.nameTe ? item.voter.nameTe : item.voter.nameEn}
                </Text>
                <Text style={st.time}>{timeAgo(item.createdAt, lang)}</Text>
              </View>
              <ChangeChips changes={item.changes} />
            </Pressable>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListEmptyComponent={
            loading ? (
              <View>
                {[0, 1, 2, 3, 4].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </View>
            ) : (
              <StateView
                glyph="📝"
                title={lang === "te" ? "మీరు ఇంకా మార్పులు చేయలేదు" : "You have not made any changes yet"}
                message={
                  lang === "te"
                    ? "ఓటరు వివరాల్లో చేసే ప్రతి మార్పు ఇక్కడ కనిపిస్తుంది. (Every voter edit you make will appear here.)"
                    : "Every voter edit you make will appear here."
                }
              />
            )
          }
        />
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
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  voterName: {
    flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15),
  },
  time: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },
});
