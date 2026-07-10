import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { RowSkeleton, SkeletonBlock } from "../../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import {
  STATUS_COLORS,
  voterName,
  type Voter,
  type VoterAccess,
  type VoterPage,
  type VoterStats,
  type VoterUnit,
} from "../../src/lib/voters";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type TurnoutFilter = "all" | "voted" | "pending";

/**
 * Polling-day rapid turnout marking — one fat tap per voter.
 * Built for election-day pressure: big targets, optimistic writes, no dialogs.
 */
export default function PollingDayScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ orgUnitId?: string; name?: string }>();

  const [unit, setUnit] = useState<{ id: string; name: string } | null>(
    params.orgUnitId ? { id: params.orgUnitId, name: params.name ?? "" } : null,
  );
  const [booths, setBooths] = useState<VoterUnit[]>([]);
  const [pickerLoading, setPickerLoading] = useState(!params.orgUnitId);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerRetry, setPickerRetry] = useState(0);

  // Live turnout counters (from /voters/stats, moved locally on each toggle).
  const [turnoutTotal, setTurnoutTotal] = useState<number | null>(null);
  const [turnoutVoted, setTurnoutVoted] = useState(0);

  const [items, setItems] = useState<Voter[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TurnoutFilter>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const requestSeq = useRef(0);

  // Resolve the booth when no params were given: my scope booth, else picker.
  useEffect(() => {
    if (unit) return;
    let cancelled = false;
    (async () => {
      setPickerLoading(true);
      setPickerError(null);
      try {
        const acc = await api<VoterAccess>("/voters/access");
        if (cancelled) return;
        if (acc.scopeUnit && acc.scopeUnit.type === "booth") {
          setUnit({ id: acc.scopeUnit.id, name: acc.scopeUnit.name });
          return;
        }
        const units = await api<VoterUnit[]>("/voters/units");
        if (cancelled) return;
        setBooths(units.filter((u) => u.type === "booth"));
      } catch (e) {
        if (!cancelled) setPickerError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, unit, pickerRetry]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const loadStats = useCallback(async () => {
    if (!unit) return;
    try {
      const stats = await api<VoterStats>(`/voters/stats?orgUnitId=${encodeURIComponent(unit.id)}`);
      setTurnoutTotal(stats.total);
      setTurnoutVoted(stats.voted);
    } catch {
      // Turnout header stays hidden — list still works.
    }
  }, [api, unit]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const fetchPage = useCallback(
    async (pageNo: number, mode: "reset" | "append" | "refresh") => {
      if (!unit) return;
      const seq = ++requestSeq.current;
      if (mode === "reset") setLoading(true);
      if (mode === "append") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          orgUnitId: unit.id,
          page: String(pageNo),
          pageSize: String(PAGE_SIZE),
        });
        if (filter === "voted") qs.set("voted", "true");
        if (filter === "pending") qs.set("voted", "false");
        if (debouncedQ) qs.set("q", debouncedQ);
        const res = await api<VoterPage>(`/voters/list?${qs.toString()}`);
        if (seq !== requestSeq.current) return; // stale response
        setListTotal(res.total);
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
    [api, unit, filter, debouncedQ],
  );

  useEffect(() => {
    void fetchPage(1, "reset");
  }, [fetchPage]);

  function loadMore() {
    if (loading || loadingMore || items.length >= listTotal) return;
    void fetchPage(page + 1, "append");
  }

  /** One fat tap = optimistic voted flip; silent rollback on failure. */
  async function toggleVoted(v: Voter) {
    const next = !v.isVoted;
    setMarkError(null);
    setItems((prev) => prev.map((it) => (it.id === v.id ? { ...it, isVoted: next } : it)));
    setTurnoutVoted((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await api<Voter>(`/voters/detail/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isVoted: next }),
      });
    } catch (e) {
      setItems((prev) => prev.map((it) => (it.id === v.id ? { ...it, isVoted: v.isVoted } : it)));
      setTurnoutVoted((c) => Math.max(0, c + (next ? -1 : 1)));
      setMarkError(e instanceof Error ? e.message : String(e));
    }
  }

  const title = lang === "te" ? "పోలింగ్ రోజు" : "Polling Day";
  const pct = turnoutTotal && turnoutTotal > 0 ? Math.round((turnoutVoted / turnoutTotal) * 100) : 0;

  const chips: Array<{ key: TurnoutFilter; label: string }> = [
    { key: "all", label: lang === "te" ? "అందరూ" : "All" },
    { key: "voted", label: lang === "te" ? "✓ ఓటు వేశారు" : "✓ Voted" },
    { key: "pending", label: lang === "te" ? "మిగిలినవారు" : "Pending" },
  ];

  // ---- Booth picker (no unit resolved yet) -------------------------------
  if (!unit) {
    return (
      <View style={st.fill}>
        <View style={st.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <Text style={st.headerTitle}>{title}</Text>
          <View style={{ width: 22 }} />
        </View>

        {pickerLoading ? (
          <View style={{ padding: 20 }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} height={58} rounded={radius.md} style={{ marginTop: 10 }} />
            ))}
          </View>
        ) : pickerError ? (
          <StateView
            glyph="⚠️"
            tone="error"
            title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
            message={pickerError}
            retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
            onRetry={() => setPickerRetry((n) => n + 1)}
          />
        ) : (
          <FlatList
            data={booths}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            ListHeaderComponent={
              <Text style={st.pickerHint}>
                {lang === "te" ? "బూత్ ఎంచుకోండి" : "Pick a booth"}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setUnit({ id: item.id, name: item.name })}
                style={({ pressed }) => [st.boothRow, pressed && { opacity: 0.75 }]}
              >
                <View style={st.boothIcon}>
                  <Feather name="home" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.boothName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.voterCount > 0 ? (
                    <Text style={st.boothMeta}>
                      {item.voterCount} {lang === "te" ? "ఓటర్లు" : "voters"}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            )}
            ListEmptyComponent={
              <StateView
                glyph="🗳️"
                title={lang === "te" ? "బూత్‌లు లేవు" : "No booths available"}
                message={
                  lang === "te"
                    ? "మీ ఏరియాలో బూత్‌లు కనబడలేదు"
                    : "No booths found in your scope"
                }
              />
            }
          />
        )}
      </View>
    );
  }

  // ---- Turnout marking list ----------------------------------------------
  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Sticky turnout strip */}
      <View style={st.turnoutBar}>
        <Text style={st.turnoutUnit} numberOfLines={1}>
          {unit.name}
        </Text>
        {turnoutTotal != null ? (
          <Text style={st.turnoutLine}>
            {lang === "te"
              ? `${turnoutVoted} / ${turnoutTotal} ఓటు వేశారు (${pct}%)`
              : `${turnoutVoted} / ${turnoutTotal} voted (${pct}%)`}
          </Text>
        ) : (
          <Text style={st.turnoutLine}>…</Text>
        )}
      </View>

      {/* Filter chips + search — always visible under pressure */}
      <View style={st.controls}>
        <View style={st.chipRow}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={({ pressed }) => [
                st.chip,
                filter === c.key && st.chipActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[st.chipText, filter === c.key && st.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.searchBar}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={st.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder={lang === "te" ? "సీరియల్ నంబర్ / పేరు" : "Serial or name"}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {markError ? <Text style={st.markError}>⚠️ {markError}</Text> : null}
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
            <TurnoutRow voter={item} lang={lang} onToggle={() => void toggleVoted(item)} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void fetchPage(1, "refresh");
                void loadStats();
              }}
            />
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
                message={lang === "te" ? "ఫిల్టర్ / వెతుకులాట మార్చండి" : "Try changing the filter or search"}
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

/** Fat touch row — tap anywhere flips the voted state. */
function TurnoutRow({
  voter,
  lang,
  onToggle,
}: {
  voter: Voter;
  lang: "te" | "en";
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [st.row, voter.isVoted && st.rowVoted, pressed && { opacity: 0.75 }]}
    >
      <View style={[st.serialCircle, voter.isVoted && st.serialCircleVoted]}>
        <Text style={[st.serialText, voter.isVoted && { color: "#fff" }]} numberOfLines={1}>
          {voter.serialNo != null ? String(voter.serialNo) : "–"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.rowName} numberOfLines={1}>
          {voterName(voter, lang)}
        </Text>
        {voter.houseNo ? (
          <Text style={st.rowMeta} numberOfLines={1}>
            {lang === "te" ? `ఇల్లు ${voter.houseNo}` : `H.No ${voter.houseNo}`}
          </Text>
        ) : null}
      </View>
      <View style={[st.checkbox, voter.isVoted && st.checkboxOn]}>
        {voter.isVoted ? <Feather name="check" size={20} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

const VOTED_TINT = "#EAF5EC";

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

  pickerHint: {
    fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(14),
    marginBottom: 10,
  },
  boothRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 14, marginBottom: 8, minHeight: 56,
  },
  boothIcon: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  boothName: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  boothMeta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },

  turnoutBar: {
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, ...shadow,
  },
  turnoutUnit: { color: colors.textMutedOnDark, fontSize: 12, fontFamily, lineHeight: lh(12) },
  turnoutLine: {
    color: "#fff", fontSize: 17, fontWeight: "700", fontFamily, lineHeight: lh(17), marginTop: 2,
  },

  controls: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: {
    flex: 1, alignItems: "center",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingVertical: 9,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  chipTextActive: { color: "#fff" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 12, marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontFamily, paddingVertical: 9 },
  markError: { color: colors.danger, fontSize: 12, fontFamily, lineHeight: lh(12), marginBottom: 6 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8, minHeight: 56,
  },
  rowVoted: { backgroundColor: VOTED_TINT, borderColor: STATUS_COLORS.green + "66" },
  serialCircle: {
    minWidth: 40, height: 40, borderRadius: 20, paddingHorizontal: 6,
    backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  serialCircleVoted: { backgroundColor: STATUS_COLORS.green },
  serialText: { fontSize: 15, fontWeight: "700", color: colors.primary, fontFamily, lineHeight: lh(15) },
  rowName: { fontSize: 16, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(16) },
  rowMeta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },
  checkbox: {
    width: 32, height: 32, borderRadius: radius.sm,
    borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: STATUS_COLORS.green, borderColor: STATUS_COLORS.green },
});
