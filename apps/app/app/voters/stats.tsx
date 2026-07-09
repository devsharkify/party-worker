import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import { STATUS_COLORS, STATUS_LABELS, type VoterStats } from "../../src/lib/voters";

interface DrillEntry {
  orgUnitId: string | null;
  name: string | null;
}

/** Voter stats — totals, support bar, gender/age tables, child-unit drill-down. */
export default function VoterStatsScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ orgUnitId?: string; name?: string }>();

  // Local drill-down stack; bottom entry comes from route params (or scope root).
  const [stack, setStack] = useState<DrillEntry[]>([
    { orgUnitId: params.orgUnitId ?? null, name: params.name ?? null },
  ]);
  const current = stack[stack.length - 1];

  const [stats, setStats] = useState<VoterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = current.orgUnitId
          ? `?orgUnitId=${encodeURIComponent(current.orgUnitId)}`
          : "";
        setStats(await api<VoterStats>(`/voters/stats${qs}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, current.orgUnitId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const title = lang === "te" ? "గణాంకాలు" : "Voter Stats";
  const turnout =
    stats && stats.total > 0 ? Math.round((stats.voted / stats.total) * 1000) / 10 : null;

  const genderRows: Array<{ label: string; value: number }> = stats
    ? [
        { label: lang === "te" ? "పురుషులు" : "Men", value: stats.gender.M },
        { label: lang === "te" ? "మహిళలు" : "Women", value: stats.gender.F },
        { label: lang === "te" ? "ఇతర" : "Other", value: stats.gender.O },
      ]
    : [];
  const ageRows: Array<{ label: string; value: number }> = stats
    ? [
        { label: "18–25", value: stats.ageBands.b18_25 },
        { label: "26–35", value: stats.ageBands.b26_35 },
        { label: "36–50", value: stats.ageBands.b36_50 },
        { label: "51–65", value: stats.ageBands.b51_65 },
        { label: "66+", value: stats.ageBands.b66p },
      ]
    : [];

  const barSegments = stats
    ? ([
        ["green", stats.marked.green],
        ["yellow", stats.marked.yellow],
        ["red", stats.marked.red],
        ["unmarked", stats.marked.unmarked],
      ] as const)
    : [];
  const barTotal = barSegments.reduce((sum, [, n]) => sum + n, 0);

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle} numberOfLines={1}>
          {current.name ?? title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SkeletonBlock height={84} rounded={radius.lg} style={{ flex: 1 }} />
            <SkeletonBlock height={84} rounded={radius.lg} style={{ flex: 1 }} />
            <SkeletonBlock height={84} rounded={radius.lg} style={{ flex: 1 }} />
          </View>
          <SkeletonBlock height={60} rounded={radius.lg} style={{ marginTop: 14 }} />
          <SkeletonBlock height={180} rounded={radius.lg} style={{ marginTop: 14 }} />
        </View>
      ) : error || !stats ? (
        <StateView
          glyph="⚠️"
          tone="error"
          title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
          message={error ?? undefined}
          retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
          onRetry={() => void load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {stack.length > 1 ? (
            <Pressable
              onPress={() => setStack((s) => s.slice(0, -1))}
              style={({ pressed }) => [st.backCrumb, pressed && { opacity: 0.7 }]}
            >
              <Feather name="chevron-left" size={16} color={colors.primary} />
              <Text style={st.backCrumbText}>
                {stack[stack.length - 2].name ??
                  (lang === "te" ? "పై స్థాయికి" : "Back to parent")}
              </Text>
            </Pressable>
          ) : null}

          {/* Summary cards */}
          <View style={st.cardRow}>
            <StatCard
              label={lang === "te" ? "మొత్తం ఓటర్లు" : "Total voters"}
              value={String(stats.total)}
            />
            <StatCard
              label={lang === "te" ? "✓ ఓటు వేశారు" : "✓ Voted"}
              value={turnout != null ? `${stats.voted} (${turnout}%)` : String(stats.voted)}
              accent
            />
            <StatCard label={lang === "te" ? "సర్వేలు" : "Surveys"} value={String(stats.surveys)} />
          </View>

          {/* Stacked support bar */}
          <Text style={st.sectionTitle}>{lang === "te" ? "మద్దతు స్థితి" : "Support status"}</Text>
          <View style={st.bar}>
            {barTotal > 0 ? (
              barSegments.map(([key, n]) =>
                n > 0 ? (
                  <View key={key} style={{ flex: n, backgroundColor: STATUS_COLORS[key] }} />
                ) : null,
              )
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.skeleton }} />
            )}
          </View>
          <View style={st.legendRow}>
            {barSegments.map(([key, n]) => (
              <View key={key} style={st.legendItem}>
                <View style={[st.legendDot, { backgroundColor: STATUS_COLORS[key] }]} />
                <Text style={st.legendText}>
                  {STATUS_LABELS[key][lang]} {n}
                </Text>
              </View>
            ))}
          </View>

          {/* Gender + age band mini tables */}
          <View style={st.tableRow}>
            <MiniTable title={lang === "te" ? "లింగం" : "Gender"} rows={genderRows} />
            <MiniTable title={lang === "te" ? "వయసు" : "Age bands"} rows={ageRows} />
          </View>

          {/* Child units */}
          {stats.units.length > 0 ? (
            <>
              <Text style={st.sectionTitle}>{lang === "te" ? "ఉప యూనిట్లు" : "Units"}</Text>
              <View style={st.unitTable}>
                <View style={[st.unitRow, st.unitHeadRow]}>
                  <Text style={[st.unitCellName, st.unitHead]}>
                    {lang === "te" ? "యూనిట్" : "Unit"}
                  </Text>
                  <Text style={[st.unitCell, st.unitHead]}>{lang === "te" ? "మొత్తం" : "Total"}</Text>
                  <Text style={[st.unitCell, st.unitHead]}>🟢🟡🔴</Text>
                  <Text style={[st.unitCell, st.unitHead]}>✓</Text>
                </View>
                {stats.units.map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => setStack((s) => [...s, { orgUnitId: u.id, name: u.name }])}
                    style={({ pressed }) => [st.unitRow, pressed && { backgroundColor: colors.primarySoft }]}
                  >
                    <Text style={st.unitCellName} numberOfLines={1}>
                      {u.name}
                    </Text>
                    <Text style={st.unitCell}>{u.total}</Text>
                    <Text style={st.unitCell}>
                      {u.green}·{u.yellow}·{u.red}
                    </Text>
                    <Text style={st.unitCell}>{u.voted}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[st.statCard, accent && { backgroundColor: colors.primary }]}>
      <Text style={[st.statValue, accent && { color: "#fff" }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[st.statLabel, accent && { color: colors.textMutedOnDark }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function MiniTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <View style={st.miniTable}>
      <Text style={st.miniTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={r.label} style={st.miniRow}>
          <Text style={st.miniLabel}>{r.label}</Text>
          <Text style={st.miniValue}>{r.value}</Text>
        </View>
      ))}
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
  headerTitle: {
    flex: 1, textAlign: "center",
    fontSize: 17, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(17),
  },

  backCrumb: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 12 },
  backCrumbText: { color: colors.primary, fontSize: 13, fontWeight: "600", fontFamily, lineHeight: lh(13) },

  cardRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 12, alignItems: "center", ...shadow,
  },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  statLabel: {
    fontSize: 11, color: colors.textMuted, fontFamily, lineHeight: lh(11),
    marginTop: 4, textAlign: "center",
  },

  sectionTitle: {
    fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(14),
    marginTop: 22, marginBottom: 10,
  },
  bar: {
    flexDirection: "row", height: 18, borderRadius: radius.pill, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },

  tableRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  miniTable: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 12,
  },
  miniTitle: {
    fontSize: 12, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(12),
    marginBottom: 8,
  },
  miniRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4,
  },
  miniLabel: { fontSize: 13, color: colors.text, fontFamily, lineHeight: lh(13) },
  miniValue: { fontSize: 13, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(13) },

  unitTable: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, overflow: "hidden",
  },
  unitRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  unitHeadRow: { backgroundColor: colors.cardMuted },
  unitHead: { fontWeight: "700", color: colors.textMuted },
  unitCellName: { flex: 2, fontSize: 13, fontWeight: "600", color: colors.text, fontFamily, lineHeight: lh(13) },
  unitCell: { flex: 1, fontSize: 12, color: colors.text, fontFamily, lineHeight: lh(12), textAlign: "right" },
});
