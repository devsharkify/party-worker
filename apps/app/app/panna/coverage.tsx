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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { RowSkeleton, SkeletonBlock } from "../../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";

interface CoverageWorker {
  workerId: string;
  name: string;
  phone: string;
  unitName: string;
  assigned: number;
}

interface PannaCoverageResponse {
  totalVoters: number;
  assigned: number;
  unassigned: number;
  coveragePct: number;
  workers: CoverageWorker[];
}

/** Leader "who has how many" panna coverage dashboard. */
export default function PannaCoverage() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{ orgUnitId?: string }>();
  const orgUnitId = params.orgUnitId ?? "";

  const [data, setData] = useState<PannaCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = orgUnitId ? `?orgUnitId=${encodeURIComponent(orgUnitId)}` : "";
        setData(await api<PannaCoverageResponse>(`/panna/coverage${qs}`));
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

  const title = lang === "te" ? "పన్నా కవరేజ్" : "Panna Coverage";
  const sortedWorkers = (data?.workers ?? []).slice().sort((a, b) => b.assigned - a.assigned);

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
          data={sortedWorkers}
          keyExtractor={(w) => w.workerId}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListHeaderComponent={
            <View>
              <CoverageHeaderCard data={data} lang={lang} />
              {data && data.unassigned > 0 ? (
                <View style={st.unassignedBanner}>
                  <Feather name="alert-triangle" size={16} color={colors.goldDark} />
                  <Text style={st.unassignedText}>
                    {lang === "te"
                      ? `${data.unassigned} ఓటర్లు ఎవరికీ కేటాయించలేదు`
                      : `${data.unassigned} voters not assigned to anyone`}
                  </Text>
                  <Pressable
                    onPress={() => router.push("/panna/assign")}
                    style={({ pressed }) => [st.assignLinkBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={st.assignLinkText}>
                      {lang === "te" ? "కేటాయించు" : "Assign"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={st.sectionLabel}>
                {lang === "te" ? "కార్యకర్తల వారీగా" : "By worker"}
              </Text>
            </View>
          }
          renderItem={({ item }) => <WorkerRow worker={item} lang={lang} />}
          ListEmptyComponent={
            <StateView
              glyph="👥"
              title={lang === "te" ? "కార్యకర్తలు లేరు" : "No workers found"}
            />
          }
        />
      )}
    </View>
  );
}

function CoverageHeaderCard({
  data,
  lang,
}: {
  data: PannaCoverageResponse | null;
  lang: "te" | "en";
}) {
  return (
    <View style={st.coverageCard}>
      <Text style={st.coveragePct}>{data?.coveragePct ?? 0}%</Text>
      <Text style={st.coverageLabel}>{lang === "te" ? "కవర్ అయ్యింది" : "covered"}</Text>
      <View style={st.coverageStrip}>
        <View style={st.coverageStat}>
          <Text style={st.coverageStatValue}>{data?.totalVoters ?? 0}</Text>
          <Text style={st.coverageStatLabel}>{lang === "te" ? "మొత్తం" : "Total"}</Text>
        </View>
        <View style={st.coverageStat}>
          <Text style={st.coverageStatValue}>{data?.assigned ?? 0}</Text>
          <Text style={st.coverageStatLabel}>{lang === "te" ? "కేటాయించారు" : "Assigned"}</Text>
        </View>
        <View style={st.coverageStat}>
          <Text style={st.coverageStatValue}>{data?.unassigned ?? 0}</Text>
          <Text style={st.coverageStatLabel}>{lang === "te" ? "మిగిలింది" : "Unassigned"}</Text>
        </View>
      </View>
    </View>
  );
}

function WorkerRow({ worker, lang }: { worker: CoverageWorker; lang: "te" | "en" }) {
  return (
    <View style={st.workerRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.workerName} numberOfLines={1}>{worker.name}</Text>
        <Text style={st.workerMeta} numberOfLines={1}>{worker.unitName}</Text>
      </View>
      <View style={st.assignedBadge}>
        <Text style={st.assignedBadgeText}>{worker.assigned}</Text>
      </View>
      <Pressable
        onPress={() => void Linking.openURL(`tel:${worker.phone}`)}
        style={({ pressed }) => [st.callBtn, pressed && { opacity: 0.8 }]}
        hitSlop={6}
      >
        <Feather name="phone" size={16} color="#fff" />
      </Pressable>
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

  coverageCard: {
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, alignItems: "center", ...shadow,
  },
  coveragePct: { color: "#fff", fontSize: 40, fontWeight: "700", fontFamily, lineHeight: lh(40) },
  coverageLabel: { color: colors.textMutedOnDark, fontSize: 13, fontFamily, lineHeight: lh(13), marginTop: 2 },
  coverageStrip: {
    flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: 16,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)",
  },
  coverageStat: { alignItems: "center" },
  coverageStatValue: { color: "#fff", fontSize: 18, fontWeight: "700", fontFamily, lineHeight: lh(18) },
  coverageStatLabel: { color: colors.textMutedOnDark, fontSize: 11, fontFamily, lineHeight: lh(11), marginTop: 2 },

  unassignedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12, marginTop: 14,
  },
  unassignedText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.goldDark, fontFamily, lineHeight: lh(12) },
  assignLinkBtn: {
    backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  assignLinkText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark, fontFamily, lineHeight: lh(12) },

  sectionLabel: {
    fontSize: 13, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(13),
    marginTop: 20, marginBottom: 10,
  },

  workerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  workerName: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  workerMeta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },
  assignedBadge: {
    backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  assignedBadgeText: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily, lineHeight: lh(13) },
  callBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
});
