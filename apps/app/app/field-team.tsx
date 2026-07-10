import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../src/auth/auth-context";
import { StateView } from "../src/components/StateView";
import { RowSkeleton } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius } from "../src/theme";
import { isFresh, timeAgo, type FieldTeamMember } from "../src/lib/field";

const AUTO_REFRESH_MS = 30 * 1000;

const DOT = {
  live: "#2B8A3E", // on duty + fresh position
  stale: "#E8A820", // on duty but no ping in 3 min
  off: "#9AA1B0", // off duty
};

/** Leader view — where my field team is right now (on-duty workers first). */
export default function FieldTeamScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [members, setMembers] = useState<FieldTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        setMembers(await api<FieldTeamMember[]>("/field/team"));
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
    const interval = setInterval(() => {
      // Silent background refresh — no spinners, keep the list live.
      void load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const onDutyCount = members.filter((m) => m.onDuty).length;
  const title = lang === "te" ? "ఫీల్డ్ టీమ్" : "Field Team";

  function openMap(m: FieldTeamMember) {
    if (m.latitude == null || m.longitude == null) return;
    void Linking.openURL(`https://maps.google.com/?q=${m.latitude},${m.longitude}`);
  }

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={st.headerTitle}>{title}</Text>
          {!loading ? (
            <Text style={st.headerSub}>
              {lang === "te" ? `${onDutyCount} మంది డ్యూటీలో` : `${onDutyCount} on duty`}
            </Text>
          ) : null}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {error && members.length === 0 ? (
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
          data={members}
          keyExtractor={(m) => m.userId}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          renderItem={({ item }) => {
            const dotColor = item.onDuty
              ? isFresh(item.updatedAt)
                ? DOT.live
                : DOT.stale
              : DOT.off;
            const hasPosition = item.latitude != null && item.longitude != null;
            return (
              <View style={st.row}>
                <View style={[st.dot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {[item.role, item.unitName].filter(Boolean).join("  ·  ")}
                  </Text>
                  <Text style={st.seen}>
                    {item.onDuty
                      ? timeAgo(item.updatedAt, lang)
                      : lang === "te"
                        ? "డ్యూటీలో లేరు"
                        : "Off duty"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => openMap(item)}
                  disabled={!hasPosition}
                  hitSlop={8}
                  style={({ pressed }) => [
                    st.mapBtn,
                    !hasPosition && { opacity: 0.35 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Feather name="map-pin" size={18} color={colors.primary} />
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View>
                {[0, 1, 2, 3, 4].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </View>
            ) : (
              <StateView
                glyph="📍"
                title={lang === "te" ? "ఎవరూ డ్యూటీలో లేరు" : "No one is on duty"}
                message={
                  lang === "te"
                    ? "కార్యకర్తలు ఓటర్ల జాబితా స్క్రీన్‌లో డ్యూటీ ఆన్ చేస్తే ఇక్కడ కనిపిస్తారు"
                    : "Workers appear here when they switch on Field Duty from the Voter Roll screen"
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  headerSub: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  meta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },
  seen: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 2 },
  mapBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
});
