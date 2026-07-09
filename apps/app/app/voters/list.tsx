import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { RowSkeleton } from "../../src/components/Skeleton";
import { VoterRow } from "../../src/components/VoterRow";
import { colors, fontFamily, lh, radius } from "../../src/theme";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type Voter,
  type VoterPage,
  type VotingStatus,
} from "../../src/lib/voters";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type StatusFilter = "all" | VotingStatus;
type GenderFilter = "all" | "M" | "F";

/** Booth voter list — infinite scroll + status/gender filters + in-unit search. */
export default function VoterList() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ orgUnitId?: string; name?: string }>();
  const orgUnitId = params.orgUnitId ?? "";
  const unitName = params.name ?? "";

  const [items, setItems] = useState<Voter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    async (pageNo: number, mode: "reset" | "append" | "refresh") => {
      const seq = ++requestSeq.current;
      if (mode === "reset") setLoading(true);
      if (mode === "append") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          orgUnitId,
          page: String(pageNo),
          pageSize: String(PAGE_SIZE),
        });
        if (status !== "all") qs.set("status", status);
        if (gender !== "all") qs.set("gender", gender);
        if (debouncedQ) qs.set("q", debouncedQ);
        const res = await api<VoterPage>(`/voters/list?${qs.toString()}`);
        if (seq !== requestSeq.current) return; // stale response
        setTotal(res.total);
        setPage(res.page);
        setItems((prev) => (mode === "append" ? [...prev, ...res.items] : res.items));
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [api, orgUnitId, status, gender, debouncedQ],
  );

  // Reset to page 1 whenever a filter / debounced query / unit changes.
  useEffect(() => {
    void fetchPage(1, "reset");
  }, [fetchPage]);

  function loadMore() {
    if (loading || loadingMore || items.length >= total) return;
    void fetchPage(page + 1, "append");
  }

  const statusChips: Array<{ key: StatusFilter; label: string; dot?: string }> = [
    { key: "all", label: lang === "te" ? "అన్నీ" : "All" },
    { key: "green", label: STATUS_LABELS.green[lang], dot: STATUS_COLORS.green },
    { key: "yellow", label: STATUS_LABELS.yellow[lang], dot: STATUS_COLORS.yellow },
    { key: "red", label: STATUS_LABELS.red[lang], dot: STATUS_COLORS.red },
    { key: "unmarked", label: STATUS_LABELS.unmarked[lang], dot: STATUS_COLORS.unmarked },
  ];
  const genderChips: Array<{ key: GenderFilter; label: string }> = [
    { key: "all", label: lang === "te" ? "అందరూ" : "All" },
    { key: "M", label: lang === "te" ? "పురుషులు" : "Men" },
    { key: "F", label: lang === "te" ? "మహిళలు" : "Women" },
  ];

  const header = (
    <View>
      <View style={st.searchBar}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={st.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder={lang === "te" ? "ఈ బూత్‌లో వెతకండి" : "Search in this booth"}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
        {statusChips.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            dot={c.dot}
            active={status === c.key}
            onPress={() => setStatus(c.key)}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
        {genderChips.map((c) => (
          <Chip key={c.key} label={c.label} active={gender === c.key} onPress={() => setGender(c.key)} />
        ))}
      </ScrollView>

      <Text style={st.countLine}>
        {total} {lang === "te" ? "ఓటర్లు" : "voters"}
      </Text>
    </View>
  );

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle} numberOfLines={1}>
          {unitName || (lang === "te" ? "ఓటర్ల జాబితా" : "Voter list")}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {error && items.length === 0 ? (
        <StateView
          glyph="⚠️"
          tone="error"
          title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
          message={error}
          retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
          onRetry={() => void fetchPage(1, "reset")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <VoterRow voter={item} lang={lang} onPress={() => router.push(`/voters/${item.id}`)} />
          )}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void fetchPage(1, "refresh")} />
          }
          ListEmptyComponent={
            loading ? (
              <View>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </View>
            ) : (
              <StateView
                glyph="🗳️"
                title={lang === "te" ? "ఓటర్లు కనబడలేదు" : "No voters found"}
                message={lang === "te" ? "ఫిల్టర్లు మార్చి చూడండి" : "Try changing the filters"}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function Chip({
  label,
  dot,
  active,
  onPress,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.chip, active && st.chipActive, pressed && { opacity: 0.8 }]}
    >
      {dot ? <View style={[st.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[st.chipText, active && st.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1, textAlign: "center",
    fontSize: 17, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(17),
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontFamily, paddingVertical: 9 },
  chipRow: { gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: colors.text, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  chipTextActive: { color: "#fff" },
  countLine: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginBottom: 10 },
});
