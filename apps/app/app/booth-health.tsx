import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../src/auth/auth-context";
import { StateView } from "../src/components/StateView";
import { RowSkeleton, SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ------------------------------------------------------------------ */
/* Contract types — mirror GET /booth-health exactly                   */
/* ------------------------------------------------------------------ */

type ReasonCode =
  | "no_voter_roll"
  | "low_panna_coverage"
  | "low_canvassing"
  | "no_active_workers"
  | "workers_going_quiet"
  | "no_workers"
  | "no_surveys";

interface BoothHealthRow {
  boothId: string;
  name: string;
  totalVoters: number;
  markedPct: number;
  supportPct: number;
  pannaPct: number;
  workers: number;
  activeWorkers: number;
  surveys: number;
  votedPct: number;
  weaknessScore: number;
  reasons: ReasonCode[];
}

interface BoothHealthSummary {
  boothCount: number;
  weak: number;
  totalVoters: number;
  markedPct: number;
  pannaPct: number;
  activeWorkers: number;
  workers: number;
}

interface BoothHealthResponse {
  booths: BoothHealthRow[];
  summary: BoothHealthSummary;
}

const REASON_LABELS: Record<ReasonCode, { te: string; en: string }> = {
  no_voter_roll: { te: "ఓటర్ల జాబితా లేదు", en: "No voter roll" },
  low_panna_coverage: { te: "పన్నా కవరేజ్ తక్కువ", en: "Low panna coverage" },
  low_canvassing: { te: "కాన్వాసింగ్ తక్కువ", en: "Low canvassing" },
  no_active_workers: { te: "క్రియాశీల కార్యకర్తలు లేరు", en: "No active workers" },
  workers_going_quiet: { te: "కార్యకర్తలు నిష్క్రియం అవుతున్నారు", en: "Workers going quiet" },
  no_workers: { te: "కార్యకర్తలు లేరు", en: "No workers" },
  no_surveys: { te: "సర్వేలు లేవు", en: "No surveys" },
};

type Filter = "all" | "weak";
const WEAK_THRESHOLD = 60;
const FAIR_THRESHOLD = 30;

function severityOf(score: number): "weak" | "fair" | "strong" {
  if (score >= WEAK_THRESHOLD) return "weak";
  if (score >= FAIR_THRESHOLD) return "fair";
  return "strong";
}

/** Leader-only command dashboard — WHICH booths are failing, worst-first. */
export default function BoothHealthScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ orgUnitId?: string }>();
  const orgUnitId = params.orgUnitId ?? "";

  const [data, setData] = useState<BoothHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = orgUnitId ? `?orgUnitId=${encodeURIComponent(orgUnitId)}` : "";
        setData(await api<BoothHealthResponse>(`/booth-health${qs}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, orgUnitId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function toggleExpand(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  }

  const title = lang === "te" ? "బూత్ హెల్త్" : "Booth Health";
  const booths = data?.booths ?? [];
  const visibleBooths = filter === "weak" ? booths.filter((b) => b.weaknessScore >= WEAK_THRESHOLD) : booths;

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
          <SkeletonBlock height={140} rounded={radius.lg} />
          <View style={{ height: 14 }} />
          {[0, 1, 2, 3].map((i) => (
            <RowSkeleton key={i} />
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
        <FlatList
          data={visibleBooths}
          keyExtractor={(b) => b.boothId}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListHeaderComponent={
            <View>
              <SummaryStrip summary={data?.summary ?? null} lang={lang} />
              <FilterToggle filter={filter} onChange={setFilter} lang={lang} />
              <Text style={st.sectionLabel}>
                {lang === "te" ? "బూత్‌ల వారీగా (బలహీనమైనవి ముందు)" : "By booth (weakest first)"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <BoothCard
              booth={item}
              lang={lang}
              expanded={expandedId === item.boothId}
              onToggle={() => toggleExpand(item.boothId)}
            />
          )}
          ListEmptyComponent={
            <StateView
              glyph="🏛️"
              title={
                filter === "weak"
                  ? lang === "te"
                    ? "బలహీనమైన బూత్‌లు లేవు"
                    : "No weak booths"
                  : lang === "te"
                    ? "బూత్‌లు లేవు"
                    : "No booths found"
              }
            />
          }
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Summary strip                                                       */
/* ------------------------------------------------------------------ */

function SummaryStrip({ summary, lang }: { summary: BoothHealthSummary | null; lang: "te" | "en" }) {
  return (
    <View style={st.summaryCard}>
      <View style={st.summaryTopRow}>
        <View style={st.summaryMain}>
          <Text style={st.summaryMainValue}>{summary?.boothCount ?? 0}</Text>
          <Text style={st.summaryMainLabel}>{lang === "te" ? "బూత్‌లు" : "Booths"}</Text>
        </View>
        <View style={[st.summaryMain, st.summaryWeakBox]}>
          <Text style={[st.summaryMainValue, st.summaryWeakValue]}>{summary?.weak ?? 0}</Text>
          <Text style={[st.summaryMainLabel, st.summaryWeakLabel]}>
            {lang === "te" ? "బలహీనం" : "Weak"}
          </Text>
        </View>
      </View>
      <View style={st.summaryStrip}>
        <View style={st.summaryStat}>
          <Text style={st.summaryStatValue}>{summary?.markedPct ?? 0}%</Text>
          <Text style={st.summaryStatLabel}>{lang === "te" ? "మార్క్ చేసారు" : "Marked"}</Text>
        </View>
        <View style={st.summaryStat}>
          <Text style={st.summaryStatValue}>{summary?.pannaPct ?? 0}%</Text>
          <Text style={st.summaryStatLabel}>{lang === "te" ? "పన్నా" : "Panna"}</Text>
        </View>
        <View style={st.summaryStat}>
          <Text style={st.summaryStatValue}>
            {summary?.activeWorkers ?? 0}/{summary?.workers ?? 0}
          </Text>
          <Text style={st.summaryStatLabel}>
            {lang === "te" ? "క్రియాశీలం" : "Active"}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Filter toggle                                                       */
/* ------------------------------------------------------------------ */

function FilterToggle({
  filter,
  onChange,
  lang,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  lang: "te" | "en";
}) {
  return (
    <View style={st.filterRow}>
      <Pressable
        onPress={() => onChange("all")}
        style={[st.filterPill, filter === "all" && st.filterPillActive]}
      >
        <Text style={[st.filterPillText, filter === "all" && st.filterPillTextActive]}>
          {lang === "te" ? "అన్నీ" : "All"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("weak")}
        style={[st.filterPill, filter === "weak" && st.filterPillActiveWeak]}
      >
        <Text style={[st.filterPillText, filter === "weak" && st.filterPillTextActive]}>
          {lang === "te" ? "బలహీనమైనవి" : "Weak only"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Booth card                                                          */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLE: Record<
  "weak" | "fair" | "strong",
  { bg: string; fg: string; te: string; en: string }
> = {
  weak: { bg: "#FCE4E4", fg: colors.danger, te: "బలహీనం", en: "Weak" },
  fair: { bg: colors.goldSoft, fg: colors.goldDark, te: "మధ్యస్థం", en: "Fair" },
  strong: { bg: colors.greenSoft, fg: colors.green, te: "బాగుంది", en: "Strong" },
};

function BoothCard({
  booth,
  lang,
  expanded,
  onToggle,
}: {
  booth: BoothHealthRow;
  lang: "te" | "en";
  expanded: boolean;
  onToggle: () => void;
}) {
  const severity = severityOf(booth.weaknessScore);
  const sev = SEVERITY_STYLE[severity];

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        st.card,
        severity === "weak" && st.cardWeak,
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={st.cardTopRow}>
        <Text style={st.cardName} numberOfLines={1}>
          {booth.name}
        </Text>
        <View style={[st.severityPill, { backgroundColor: sev.bg }]}>
          <Text style={[st.severityPillText, { color: sev.fg }]}>{sev[lang]}</Text>
        </View>
      </View>

      <View style={st.metricRow}>
        <MetricChip label={lang === "te" ? "ఓటర్లు" : "Voters"} value={String(booth.totalVoters)} />
        <MetricChip label={lang === "te" ? "మార్క్" : "Marked"} value={`${booth.markedPct}%`} />
        <MetricChip label={lang === "te" ? "పన్నా" : "Panna"} value={`${booth.pannaPct}%`} />
        <MetricChip
          label={lang === "te" ? "కార్యకర్తలు" : "Active"}
          value={`${booth.activeWorkers}/${booth.workers}`}
        />
      </View>

      {booth.reasons.length > 0 ? (
        <View style={st.reasonRow}>
          {booth.reasons.map((r) => (
            <View key={r} style={st.reasonChip}>
              <Text style={st.reasonChipText}>{REASON_LABELS[r][lang]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {expanded ? (
        <View style={st.expandedGrid}>
          <MetricBar label={lang === "te" ? "మార్క్ చేసారు" : "Marked"} pct={booth.markedPct} color={colors.primary} />
          <MetricBar label={lang === "te" ? "మద్దతు" : "Support"} pct={booth.supportPct} color={colors.green} />
          <MetricBar label={lang === "te" ? "పన్నా కవరేజ్" : "Panna coverage"} pct={booth.pannaPct} color={colors.gold} />
          <MetricBar label={lang === "te" ? "ఓటు వేసారు" : "Voted"} pct={booth.votedPct} color={colors.goldDark} />
          <View style={st.expandedFooterRow}>
            <Text style={st.expandedFooterText}>
              {lang === "te" ? "సర్వేలు" : "Surveys"}: {booth.surveys}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={st.expandHint}>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.metricChip}>
      <Text style={st.metricChipValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={st.metricChipLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={st.metricBarRow}>
      <View style={st.metricBarLabelRow}>
        <Text style={st.metricBarLabel}>{label}</Text>
        <Text style={st.metricBarPct}>{pct}%</Text>
      </View>
      <View style={st.metricBarTrack}>
        <View style={[st.metricBarFill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
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

  /* Summary */
  summaryCard: {
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: 18, ...shadow,
  },
  summaryTopRow: { flexDirection: "row", gap: 10 },
  summaryMain: { flex: 1, alignItems: "center", paddingVertical: 6 },
  summaryMainValue: { color: "#fff", fontSize: 32, fontWeight: "700", fontFamily, lineHeight: lh(32) },
  summaryMainLabel: { color: colors.textMutedOnDark, fontSize: 12, fontFamily, lineHeight: lh(12), marginTop: 2 },
  summaryWeakBox: { backgroundColor: "rgba(220,38,38,0.22)", borderRadius: radius.md },
  summaryWeakValue: { color: "#FFD4D4" },
  summaryWeakLabel: { color: "#FFD4D4" },
  summaryStrip: {
    flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: 16,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)",
  },
  summaryStat: { alignItems: "center" },
  summaryStatValue: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily, lineHeight: lh(16) },
  summaryStatLabel: { color: colors.textMutedOnDark, fontSize: 11, fontFamily, lineHeight: lh(11), marginTop: 2 },

  /* Filter */
  filterRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  filterPill: {
    flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterPillActiveWeak: { backgroundColor: colors.danger, borderColor: colors.danger },
  filterPillText: { fontSize: 13, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(13) },
  filterPillTextActive: { color: "#fff" },

  sectionLabel: {
    fontSize: 13, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(13),
    marginTop: 20, marginBottom: 10,
  },

  /* Booth card */
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow,
  },
  cardWeak: { borderColor: colors.danger + "55", backgroundColor: "#FFFBFB" },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  severityPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  severityPillText: { fontSize: 11, fontWeight: "700", fontFamily, lineHeight: lh(11) },

  metricRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  metricChip: {
    flex: 1, backgroundColor: colors.cardMuted, borderRadius: radius.md,
    paddingVertical: 8, paddingHorizontal: 4, alignItems: "center",
  },
  metricChipValue: { fontSize: 14, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(14) },
  metricChipLabel: { fontSize: 10, color: colors.textMuted, fontFamily, lineHeight: lh(10), marginTop: 2 },

  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  reasonChip: {
    backgroundColor: colors.goldSoft, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  reasonChipText: { fontSize: 11, fontWeight: "600", color: colors.goldDark, fontFamily, lineHeight: lh(11) },

  expandHint: { alignItems: "center", marginTop: 6 },

  expandedGrid: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 10,
  },
  metricBarRow: {},
  metricBarLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metricBarLabel: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },
  metricBarPct: { fontSize: 12, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(12) },
  metricBarTrack: {
    height: 8, borderRadius: radius.pill, backgroundColor: colors.skeleton, overflow: "hidden",
  },
  metricBarFill: { height: "100%", borderRadius: radius.pill },
  expandedFooterRow: { marginTop: 2 },
  expandedFooterText: { fontSize: 12, fontWeight: "600", color: colors.textMuted, fontFamily, lineHeight: lh(12) },
});
