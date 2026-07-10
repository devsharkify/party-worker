import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
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
import { RowSkeleton, SkeletonBlock } from "../../src/components/Skeleton";
import { VoterRow } from "../../src/components/VoterRow";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import { STATUS_COLORS, type Voter } from "../../src/lib/voters";

/** GET /panna/mine response shape. */
interface PannaVoter extends Voter {
  knowsPersonally: boolean;
}

interface PannaSummary {
  green: number;
  yellow: number;
  red: number;
  unmarked: number;
  voted: number;
  known: number;
}

interface PannaMineResponse {
  total: number;
  summary: PannaSummary;
  voters: PannaVoter[];
}

type FilterKey = "all" | "green" | "pending" | "known";

/**
 * My Voters (panna) home — the worker's fixed, permanently-assigned voter
 * slice. Meant to be the primary daily surface: assignment summary up top,
 * filterable voter list below, quick star-toggle for "I know them personally".
 */
export default function PannaHome() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [data, setData] = useState<PannaMineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  // Voter ids with an in-flight knows-personally PATCH — disables the star to
  // avoid double taps racing each other.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setData(await api<PannaMineResponse>("/panna/mine"));
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

  async function toggleKnows(voter: PannaVoter) {
    if (togglingIds.has(voter.id)) return;
    const nextValue = !voter.knowsPersonally;

    // Optimistic update — flip locally, patch the summary "known" count.
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: {
          ...prev.summary,
          known: prev.summary.known + (nextValue ? 1 : -1),
        },
        voters: prev.voters.map((v) =>
          v.id === voter.id ? { ...v, knowsPersonally: nextValue } : v,
        ),
      };
    });
    setTogglingIds((prev) => new Set(prev).add(voter.id));

    try {
      await api<{ voterId: string; knowsPersonally: boolean }>(
        `/panna/mine/${voter.id}/knows`,
        { method: "PATCH", body: JSON.stringify({ knowsPersonally: nextValue }) },
      );
    } catch {
      // Roll back on failure.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            known: prev.summary.known + (nextValue ? -1 : 1),
          },
          voters: prev.voters.map((v) =>
            v.id === voter.id ? { ...v, knowsPersonally: !nextValue } : v,
          ),
        };
      });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(voter.id);
        return next;
      });
    }
  }

  const filterChips: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: lang === "te" ? "అన్నీ" : "All" },
    { key: "green", label: lang === "te" ? "🟢 మద్దతు" : "🟢 Support" },
    { key: "pending", label: lang === "te" ? "గుర్తించనివి" : "Pending" },
    { key: "known", label: lang === "te" ? "★ తెలిసినవారు" : "★ Known" },
  ];

  const voters = data?.voters ?? [];
  const filtered = voters.filter((v) => {
    if (filter === "green") return v.votingStatus === "green";
    if (filter === "pending") return v.votingStatus === "unmarked";
    if (filter === "known") return v.knowsPersonally;
    return true;
  });

  const title = lang === "te" ? "నా ఓటర్లు" : "My Voters";

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
        <View style={{ padding: 20 }}>
          <SkeletonBlock height={110} rounded={radius.lg} />
          <SkeletonBlock height={48} rounded={radius.pill} style={{ marginTop: 14 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} height={58} rounded={radius.md} style={{ marginTop: 10 }} />
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
      ) : data && data.total === 0 ? (
        <StateView
          glyph="🗳️"
          title={
            lang === "te"
              ? "మీకు ఇంకా ఓటర్లు కేటాయించలేదు"
              : "No voters assigned to you yet"
          }
          message={
            lang === "te"
              ? "మీ లీడర్‌ని అడగండి."
              : "Ask your leader."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <View style={st.rowWrap}>
              <View style={{ flex: 1 }}>
                <VoterRow
                  voter={item}
                  lang={lang}
                  onPress={() => router.push(`/voters/${item.id}`)}
                />
              </View>
              <Pressable
                onPress={() => void toggleKnows(item)}
                disabled={togglingIds.has(item.id)}
                hitSlop={10}
                style={({ pressed }) => [st.starBtn, pressed && { opacity: 0.7 }]}
              >
                <Feather
                  name="star"
                  size={18}
                  color={item.knowsPersonally ? colors.gold : colors.textMuted}
                />
              </Pressable>
            </View>
          )}
          ListHeaderComponent={
            <View>
              <SummaryCard total={data?.total ?? 0} summary={data?.summary ?? null} lang={lang} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.chipRow}
              >
                {filterChips.map((c) => (
                  <Chip
                    key={c.key}
                    label={c.label}
                    active={filter === c.key}
                    onPress={() => setFilter(c.key)}
                  />
                ))}
              </ScrollView>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListEmptyComponent={
            <StateView
              glyph="🔍"
              title={lang === "te" ? "ఈ ఫిల్టర్‌లో ఓటర్లు లేరు" : "No voters in this filter"}
            />
          }
        />
      )}
    </View>
  );
}

function SummaryCard({
  total,
  summary,
  lang,
}: {
  total: number;
  summary: PannaSummary | null;
  lang: "te" | "en";
}) {
  const stats: Array<{ glyph: string; value: number; color: string }> = [
    { glyph: "🟢", value: summary?.green ?? 0, color: STATUS_COLORS.green },
    { glyph: "🟡", value: summary?.yellow ?? 0, color: STATUS_COLORS.yellow },
    { glyph: "🔴", value: summary?.red ?? 0, color: STATUS_COLORS.red },
  ];
  return (
    <View style={st.summaryCard}>
      <View style={st.summaryTop}>
        <View>
          <Text style={st.summaryTotal}>{total}</Text>
          <Text style={st.summaryLabel}>
            {lang === "te" ? "మీకు కేటాయించిన ఓటర్లు" : "voters assigned to you"}
          </Text>
        </View>
        <Feather name="users" size={28} color={colors.gold} />
      </View>
      <View style={st.statStrip}>
        {stats.map((s) => (
          <View key={s.glyph} style={st.statItem}>
            <Text style={st.statGlyph}>{s.glyph}</Text>
            <Text style={st.statValue}>{s.value}</Text>
          </View>
        ))}
        <View style={st.statItem}>
          <Feather name="check-circle" size={14} color="#fff" />
          <Text style={st.statValue}>{summary?.voted ?? 0}</Text>
        </View>
        <View style={st.statItem}>
          <Feather name="star" size={14} color={colors.gold} />
          <Text style={st.statValue}>{summary?.known ?? 0}</Text>
        </View>
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.chip, active && st.chipActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[st.chipText, active && st.chipTextActive]}>{label}</Text>
    </Pressable>
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

  summaryCard: {
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: 18, ...shadow,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTotal: { color: "#fff", fontSize: 34, fontWeight: "700", fontFamily, lineHeight: lh(34) },
  summaryLabel: { color: colors.textMutedOnDark, fontSize: 13, fontFamily, lineHeight: lh(13), marginTop: 2 },
  statStrip: {
    flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)",
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statGlyph: { fontSize: 13, fontFamily, lineHeight: lh(13) },
  statValue: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily, lineHeight: lh(14) },

  chipRow: { gap: 8, paddingVertical: 14 },
  chip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  chipTextActive: { color: "#fff" },

  rowWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  starBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
});
