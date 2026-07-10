import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import type { Voter, VoterPage } from "../../src/lib/voters";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

/** Scope-wide voter search — name / EPIC / house no. */
export default function VoterSearch() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ q?: string }>();

  const [q, setQ] = useState(params.q ?? "");
  const [debouncedQ, setDebouncedQ] = useState((params.q ?? "").trim());
  const [items, setItems] = useState<Voter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    async (pageNo: number, append: boolean) => {
      const seq = ++requestSeq.current;
      if (debouncedQ.length < MIN_QUERY_LEN) {
        setItems([]);
        setTotal(0);
        setLoading(false);
        setError(null);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          q: debouncedQ,
          page: String(pageNo),
          pageSize: String(PAGE_SIZE),
        });
        const res = await api<VoterPage>(`/voters/search?${qs.toString()}`);
        if (seq !== requestSeq.current) return;
        setTotal(res.total);
        setPage(res.page);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [api, debouncedQ],
  );

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  function loadMore() {
    if (loading || loadingMore || items.length >= total) return;
    void fetchPage(page + 1, true);
  }

  const title = lang === "te" ? "ఓటరు వెతుకులాట" : "Search Voters";

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={st.searchWrap}>
        <View style={st.searchBar}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={st.searchInput}
            value={q}
            onChangeText={setQ}
            autoFocus
            returnKeyType="search"
            placeholder={lang === "te" ? "పేరు / EPIC / ఇంటి నంబర్" : "Name / EPIC / house no"}
            placeholderTextColor={colors.textMuted}
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {debouncedQ.length >= MIN_QUERY_LEN && !loading ? (
          <Text style={st.countLine}>
            {total} {lang === "te" ? "ఫలితాలు" : "results"}
          </Text>
        ) : null}
      </View>

      {error ? (
        <StateView
          glyph="⚠️"
          tone="error"
          title={lang === "te" ? "వెతకడం కుదరలేదు" : "Search failed"}
          message={error}
          retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
          onRetry={() => void fetchPage(1, false)}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <VoterRow voter={item} lang={lang} onPress={() => router.push(`/voters/${item.id}`)} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            loading ? (
              <View>
                {[0, 1, 2, 3, 4].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </View>
            ) : debouncedQ.length >= MIN_QUERY_LEN ? (
              <StateView
                glyph="🔍"
                title={lang === "te" ? "ఫలితాలు లేవు" : "No results"}
                message={lang === "te" ? "వేరే పదంతో వెతకండి" : "Try a different search"}
              />
            ) : (
              <StateView
                glyph="🔍"
                title={lang === "te" ? "వెతకడం ప్రారంభించండి" : "Start searching"}
                message={
                  lang === "te"
                    ? "మీ ఏరియాలోని ఓటర్లందరిలో వెతుకుతుంది"
                    : "Searches all voters in your scope"
                }
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

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontFamily, paddingVertical: 10 },
  countLine: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 8 },
});
