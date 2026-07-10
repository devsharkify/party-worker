import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { FieldDutyCard } from "../../src/components/FieldDutyCard";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import {
  UNIT_TYPE_LABELS,
  type VoterAccess,
  type VoterUnit,
} from "../../src/lib/voters";

/**
 * Voter Roll hub — access gate, scope-wide search, unit drill-down and
 * shortcuts to stats / surveys.
 */
export default function VotersHub() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [access, setAccess] = useState<VoterAccess | null>(null);
  const [units, setUnits] = useState<VoterUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  /** Drill-down stack of unit ids; empty = scope roots. */
  const [drill, setDrill] = useState<VoterUnit[]>([]);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const acc = await api<VoterAccess>("/voters/access");
        setAccess(acc);
        if (acc.enabled) {
          setUnits(await api<VoterUnit[]>("/voters/units"));
        }
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

  const currentParent = drill.length > 0 ? drill[drill.length - 1] : null;
  const children = useMemo(() => {
    const ids = new Set(units.map((u) => u.id));
    if (currentParent) return units.filter((u) => u.parentId === currentParent.id);
    // Scope roots: parent missing or outside my scope.
    return units.filter((u) => u.parentId === null || !ids.has(u.parentId));
  }, [units, currentParent]);

  function openUnit(u: VoterUnit) {
    if (u.type === "booth") {
      router.push(`/voters/list?orgUnitId=${encodeURIComponent(u.id)}&name=${encodeURIComponent(u.name)}`);
    } else {
      setDrill((d) => [...d, u]);
    }
  }

  function submitSearch() {
    const query = q.trim();
    router.push(query ? `/voters/search?q=${encodeURIComponent(query)}` : "/voters/search");
  }

  const title = lang === "te" ? "ఓటర్ల జాబితా" : "Voter Roll";

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
          <SkeletonBlock height={48} rounded={radius.lg} />
          <SkeletonBlock height={92} rounded={radius.lg} style={{ marginTop: 14 }} />
          {[0, 1, 2, 3].map((i) => (
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
      ) : access && !access.enabled ? (
        <View style={st.lockedWrap}>
          <View style={st.lockRing}>
            <Feather name="lock" size={30} color={colors.textMuted} />
          </View>
          <Text style={st.lockedTitle}>
            {lang === "te" ? "ఓటర్ల జాబితా యాక్సెస్ లేదు" : "Voter roll access is not enabled"}
          </Text>
          <Text style={st.lockedMsg}>
            {lang === "te"
              ? "మీకు ఓటర్ల జాబితా యాక్సెస్ ఇవ్వబడలేదు. మీ నాయకుడు/అడ్మిన్‌ను అడగండి."
              : "Voter roll access is not enabled for you. Ask your leader/admin."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={st.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {access?.scopeUnit ? (
            <View style={st.scopeCard}>
              <Feather name="map-pin" size={16} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={st.scopeLabel}>{lang === "te" ? "మీ ఏరియా" : "Your scope"}</Text>
                <Text style={st.scopeName} numberOfLines={1}>
                  {access.scopeUnit.name}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Big search bar → scope-wide search */}
          <View style={st.searchBar}>
            <Feather name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={st.searchInput}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
              placeholder={lang === "te" ? "పేరు / EPIC / ఇంటి నంబర్ వెతకండి" : "Search name / EPIC / house no"}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable onPress={submitSearch} hitSlop={8}>
              <Feather name="arrow-right-circle" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {/* Action row */}
          <View style={st.actionRow}>
            <ActionTile
              icon="bar-chart-2"
              label={lang === "te" ? "లెక్కలు" : "Stats"}
              onPress={() => router.push("/voters/stats")}
            />
            <ActionTile
              icon="clipboard"
              label={lang === "te" ? "నా సర్వేలు" : "My Surveys"}
              onPress={() => router.push("/voters/my-surveys")}
            />
            <ActionTile
              icon="plus-circle"
              label={lang === "te" ? "కొత్త సర్వే" : "New Survey"}
              onPress={() => router.push("/voters/survey")}
            />
          </View>
          <View style={st.actionRow}>
            <ActionTile
              icon="check-square"
              label={lang === "te" ? "పోలింగ్ రోజు" : "Polling Day"}
              onPress={() => router.push("/voters/polling-day")}
            />
            <ActionTile
              icon="edit-3"
              label={lang === "te" ? "నా మార్పులు" : "My Changes"}
              onPress={() => router.push("/voters/my-changes")}
            />
          </View>

          {/* Field duty — live location sharing while on the ground */}
          <FieldDutyCard />

          {/* Drill-down breadcrumb */}
          <View style={st.crumbRow}>
            {drill.length > 0 ? (
              <Pressable
                onPress={() => setDrill((d) => d.slice(0, -1))}
                hitSlop={8}
                style={({ pressed }) => [st.crumbBack, pressed && { opacity: 0.7 }]}
              >
                <Feather name="chevron-left" size={16} color={colors.primary} />
                <Text style={st.crumbBackText}>{lang === "te" ? "వెనుకకు" : "Back"}</Text>
              </Pressable>
            ) : null}
            <Text style={st.crumbTitle} numberOfLines={1}>
              {currentParent
                ? currentParent.name
                : lang === "te"
                  ? "యూనిట్లు"
                  : "Units"}
            </Text>
          </View>

          {children.length === 0 ? (
            <Text style={st.emptyUnits}>
              {lang === "te" ? "యూనిట్లు లేవు" : "No units here"}
            </Text>
          ) : (
            children.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => openUnit(u)}
                style={({ pressed }) => [st.unitRow, pressed && { opacity: 0.75 }]}
              >
                <View style={st.unitIcon}>
                  <Feather name={u.type === "booth" ? "home" : "layers"} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.unitName} numberOfLines={1}>
                    {u.name}
                  </Text>
                  <Text style={st.unitMeta}>
                    {UNIT_TYPE_LABELS[u.type]?.[lang] ?? u.type}
                    {u.type === "booth" && u.voterCount > 0
                      ? `  ·  ${u.voterCount} ${lang === "te" ? "ఓటర్లు" : "voters"}`
                      : ""}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.tile, pressed && { opacity: 0.8 }]}>
      <Feather name={icon} size={20} color={colors.primary} />
      <Text style={st.tileLabel} numberOfLines={1}>
        {label}
      </Text>
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
  content: { padding: 16, paddingBottom: 40 },

  lockedWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  lockRing: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 17, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(17), textAlign: "center",
  },
  lockedMsg: {
    fontSize: 14, color: colors.textMuted, fontFamily, lineHeight: lh(14) + 4, textAlign: "center", marginTop: 8,
  },

  scopeCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: 14, marginBottom: 14, ...shadow,
  },
  scopeLabel: { color: colors.textMutedOnDark, fontSize: 11, fontFamily, lineHeight: lh(11) },
  scopeName: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily, lineHeight: lh(15) },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 4, ...shadow,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontFamily, paddingVertical: 10 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  tile: {
    flex: 1, alignItems: "center", gap: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: 14, ...shadow,
  },
  tileLabel: { fontSize: 12, fontWeight: "600", color: colors.text, fontFamily, lineHeight: lh(12) },

  crumbRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 10 },
  crumbBack: { flexDirection: "row", alignItems: "center" },
  crumbBackText: { color: colors.primary, fontSize: 13, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  crumbTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(14) },
  emptyUnits: { color: colors.textMuted, fontSize: 13, fontFamily, lineHeight: lh(13), paddingVertical: 12 },

  unitRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  unitIcon: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  unitName: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  unitMeta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },
});
