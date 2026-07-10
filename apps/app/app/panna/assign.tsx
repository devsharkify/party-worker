import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { OrgMemberRow, OrgUnitNode } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { SkeletonBlock, RowSkeleton } from "../../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import { STATUS_COLORS, voterName, type Voter, type VoterPage, type VoterUnit } from "../../src/lib/voters";

const PAGE_SIZE = 100;

type Step = 1 | 2 | 3;

/**
 * Leader-only panna assignment flow.
 * Step 1: pick a worker (from /org/manageable → /org/units/:id/members).
 * Step 2: pick a booth (from /voters/units).
 * Step 3: checkbox-select voters in that booth, then POST /panna/assign.
 */
export default function PannaAssign() {
  const router = useRouter();
  const { api, user } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";

  const [step, setStep] = useState<Step>(1);

  // --- Step 1: worker roster ---
  const [units, setUnits] = useState<OrgUnitNode[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [roster, setRoster] = useState<OrgMemberRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<OrgMemberRow | null>(null);

  const loadUnits = useCallback(async () => {
    setRosterLoading(true);
    setRosterError(null);
    try {
      const list = await api<OrgUnitNode[]>("/org/manageable");
      setUnits(list);
      const own = list.find((u) => u.id === user?.orgUnitId);
      setUnitId((prev) => prev ?? own?.id ?? list[0]?.id ?? null);
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRosterLoading(false);
    }
  }, [api, user?.orgUnitId]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);
    api<OrgMemberRow[]>(`/org/units/${unitId}/members?subtree=true`)
      .then((rows) => {
        if (cancelled) return;
        setRoster(rows.filter((m) => m.role === "worker"));
      })
      .catch((e) => {
        if (cancelled) return;
        setRosterError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, unitId]);

  // --- Step 2: booth units ---
  const [voterUnits, setVoterUnits] = useState<VoterUnit[]>([]);
  const [boothsLoading, setBoothsLoading] = useState(false);
  const [boothsError, setBoothsError] = useState<string | null>(null);
  const [selectedBooth, setSelectedBooth] = useState<VoterUnit | null>(null);

  const loadBooths = useCallback(async () => {
    setBoothsLoading(true);
    setBoothsError(null);
    try {
      setVoterUnits(await api<VoterUnit[]>("/voters/units"));
    } catch (e) {
      setBoothsError(e instanceof Error ? e.message : String(e));
    } finally {
      setBoothsLoading(false);
    }
  }, [api]);

  const booths = useMemo(() => voterUnits.filter((u) => u.type === "booth"), [voterUnits]);

  // --- Step 3: booth voters + selection ---
  const [voters, setVoters] = useState<Voter[]>([]);
  const [votersTotal, setVotersTotal] = useState(0);
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersError, setVotersError] = useState<string | null>(null);
  const [selectedVoterIds, setSelectedVoterIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  const loadBoothVoters = useCallback(
    async (booth: VoterUnit) => {
      setVotersLoading(true);
      setVotersError(null);
      try {
        const qs = new URLSearchParams({
          orgUnitId: booth.id,
          page: "1",
          pageSize: String(PAGE_SIZE),
        });
        const res = await api<VoterPage>(`/voters/list?${qs.toString()}`);
        setVoters(res.items);
        setVotersTotal(res.total);
      } catch (e) {
        setVotersError(e instanceof Error ? e.message : String(e));
      } finally {
        setVotersLoading(false);
      }
    },
    [api],
  );

  function goToStep2() {
    setStep(2);
    if (voterUnits.length === 0) void loadBooths();
  }

  function pickBooth(b: VoterUnit) {
    setSelectedBooth(b);
    setSelectedVoterIds(new Set());
    setAssignedCount(null);
    setAssignError(null);
    setStep(3);
    void loadBoothVoters(b);
  }

  function toggleVoter(id: string) {
    setSelectedVoterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedVoterIds((prev) => {
      const allSelected = voters.length > 0 && voters.every((v) => prev.has(v.id));
      if (allSelected) {
        const next = new Set(prev);
        voters.forEach((v) => next.delete(v.id));
        return next;
      }
      const next = new Set(prev);
      voters.forEach((v) => next.add(v.id));
      return next;
    });
  }

  async function submitAssign() {
    if (!selectedWorker || selectedVoterIds.size === 0 || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await api<{ assigned: number }>("/panna/assign", {
        method: "POST",
        body: JSON.stringify({
          workerId: selectedWorker.id,
          voterIds: Array.from(selectedVoterIds),
        }),
      });
      setAssignedCount(res.assigned);
      setSelectedVoterIds(new Set());
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(false);
    }
  }

  const title = lang === "te" ? "ఓటర్లు కేటాయించు" : "Assign Voters";
  const allSelectedOnPage = voters.length > 0 && voters.every((v) => selectedVoterIds.has(v.id));

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Pressable
          onPress={() => (step === 1 ? router.back() : setStep((s) => (s - 1) as Step))}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <StepIndicator step={step} lang={lang} />

      {step === 1 ? (
        <ScrollView contentContainerStyle={st.content}>
          <Text style={st.sectionLabel}>
            {lang === "te" ? "యూనిట్ ఎంచుకోండి" : "Pick a unit"}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
            {units.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => setUnitId(u.id)}
                style={({ pressed }) => [
                  st.unitChip,
                  unitId === u.id && st.unitChipActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[st.unitChipText, unitId === u.id && st.unitChipTextActive]} numberOfLines={1}>
                  {u.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[st.sectionLabel, { marginTop: 18 }]}>
            {lang === "te" ? "కార్యకర్తను ఎంచుకోండి" : "Pick a worker"}
          </Text>

          {rosterLoading ? (
            [0, 1, 2].map((i) => <RowSkeleton key={i} />)
          ) : rosterError ? (
            <StateView
              tone="error"
              title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
              message={rosterError}
              retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
              onRetry={() => void loadUnits()}
            />
          ) : roster.length === 0 ? (
            <StateView
              glyph="👤"
              title={lang === "te" ? "కార్యకర్తలు లేరు" : "No workers here"}
              message={lang === "te" ? "వేరే యూనిట్ ఎంచుకోండి" : "Try a different unit"}
            />
          ) : (
            roster.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setSelectedWorker(m);
                  goToStep2();
                }}
                style={({ pressed }) => [
                  st.workerRow,
                  selectedWorker?.id === m.id && st.workerRowActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={st.workerAvatar}>
                  <Text style={st.workerInitial}>{m.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.workerName} numberOfLines={1}>{m.name}</Text>
                  <Text style={st.workerMeta} numberOfLines={1}>{m.orgUnitName}  ·  {m.phone}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : step === 2 ? (
        <ScrollView contentContainerStyle={st.content}>
          {selectedWorker ? (
            <View style={st.pickedBanner}>
              <Feather name="user-check" size={16} color={colors.primary} />
              <Text style={st.pickedBannerText} numberOfLines={1}>
                {lang === "te" ? "కార్యకర్త" : "Worker"}: {selectedWorker.name}
              </Text>
            </View>
          ) : null}
          <Text style={st.sectionLabel}>{lang === "te" ? "బూత్ ఎంచుకోండి" : "Pick a booth"}</Text>

          {boothsLoading ? (
            [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)
          ) : boothsError ? (
            <StateView
              tone="error"
              title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
              message={boothsError}
              retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
              onRetry={() => void loadBooths()}
            />
          ) : booths.length === 0 ? (
            <StateView
              glyph="🏠"
              title={lang === "te" ? "బూత్‌లు లేవు" : "No booths found"}
            />
          ) : (
            booths.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => pickBooth(b)}
                style={({ pressed }) => [st.unitRow, pressed && { opacity: 0.75 }]}
              >
                <View style={st.unitIcon}>
                  <Feather name="home" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.unitName} numberOfLines={1}>{b.name}</Text>
                  <Text style={st.unitMeta}>
                    {b.voterCount} {lang === "te" ? "ఓటర్లు" : "voters"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : (
        <View style={st.fill}>
          {assignedCount !== null ? (
            <View style={st.successBanner}>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={st.successText}>
                {lang === "te"
                  ? `${assignedCount} మంది ఓటర్లు కేటాయించబడ్డారు`
                  : `${assignedCount} voters assigned`}
              </Text>
            </View>
          ) : null}

          {votersLoading ? (
            <View style={st.content}>
              {[0, 1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)}
            </View>
          ) : votersError ? (
            <StateView
              tone="error"
              title={lang === "te" ? "లోడ్ కాలేదు" : "Could not load"}
              message={votersError}
              retryLabel={lang === "te" ? "మళ్లీ ప్రయత్నించండి" : "Retry"}
              onRetry={() => selectedBooth && void loadBoothVoters(selectedBooth)}
            />
          ) : (
            <FlatList
              data={voters}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListHeaderComponent={
                <View>
                  {selectedWorker ? (
                    <View style={st.pickedBanner}>
                      <Feather name="user-check" size={16} color={colors.primary} />
                      <Text style={st.pickedBannerText} numberOfLines={1}>
                        {lang === "te" ? "కార్యకర్త" : "Worker"}: {selectedWorker.name}
                        {"  ·  "}
                        {lang === "te" ? "బూత్" : "Booth"}: {selectedBooth?.name}
                      </Text>
                    </View>
                  ) : null}
                  <View style={st.selectAllRow}>
                    <Text style={st.countLine}>
                      {votersTotal} {lang === "te" ? "ఓటర్లు" : "voters"}
                      {"  ·  "}
                      {selectedVoterIds.size} {lang === "te" ? "ఎంచుకున్నారు" : "selected"}
                    </Text>
                    <Pressable onPress={toggleSelectAllOnPage} hitSlop={8}>
                      <Text style={st.selectAllText}>
                        {allSelectedOnPage
                          ? (lang === "te" ? "అన్నీ తీసివేయి" : "Clear all")
                          : (lang === "te" ? "పేజీలో అన్నీ ఎంచుకో" : "Select all on page")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <VoterCheckRow
                  voter={item}
                  lang={lang}
                  checked={selectedVoterIds.has(item.id)}
                  onToggle={() => toggleVoter(item.id)}
                />
              )}
              ListEmptyComponent={
                <StateView
                  glyph="🗳️"
                  title={lang === "te" ? "ఈ బూత్‌లో ఓటర్లు లేరు" : "No voters in this booth"}
                />
              }
            />
          )}

          {selectedVoterIds.size > 0 ? (
            <View style={st.stickyBar}>
              {assignError ? <Text style={st.stickyError}>{assignError}</Text> : null}
              <Pressable
                onPress={() => void submitAssign()}
                disabled={assigning}
                style={({ pressed }) => [st.assignBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={st.assignBtnText}>
                  {assigning
                    ? (lang === "te" ? "కేటాయిస్తోంది…" : "Assigning…")
                    : lang === "te"
                      ? `కేటాయించు (${selectedVoterIds.size})`
                      : `Assign (${selectedVoterIds.size})`}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function StepIndicator({ step, lang }: { step: Step; lang: "te" | "en" }) {
  const labels =
    lang === "te" ? ["కార్యకర్త", "బూత్", "ఓటర్లు"] : ["Worker", "Booth", "Voters"];
  return (
    <View style={st.stepRow}>
      {labels.map((label, idx) => {
        const n = (idx + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <View key={label} style={st.stepItem}>
            <View
              style={[
                st.stepDot,
                active && st.stepDotActive,
                done && st.stepDotDone,
              ]}
            >
              <Text style={[st.stepDotText, (active || done) && st.stepDotTextActive]}>
                {done ? "✓" : n}
              </Text>
            </View>
            <Text style={[st.stepLabel, active && st.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function VoterCheckRow({
  voter,
  lang,
  checked,
  onToggle,
}: {
  voter: Voter;
  lang: "te" | "en";
  checked: boolean;
  onToggle: () => void;
}) {
  const meta: string[] = [];
  if (voter.serialNo != null) meta.push(`#${voter.serialNo}`);
  const ageGender = [voter.age != null ? `${voter.age}` : null, voter.gender || null]
    .filter(Boolean)
    .join(" · ");
  if (ageGender) meta.push(ageGender);
  if (voter.houseNo) meta.push(lang === "te" ? `ఇల్లు ${voter.houseNo}` : `H.No ${voter.houseNo}`);

  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [st.checkRow, pressed && { opacity: 0.75 }]}>
      <View style={[st.checkbox, checked && st.checkboxChecked]}>
        {checked ? <Feather name="check" size={14} color="#fff" /> : null}
      </View>
      <View style={[st.dot, { backgroundColor: STATUS_COLORS[voter.votingStatus] ?? STATUS_COLORS.unmarked }]} />
      <View style={{ flex: 1 }}>
        <Text style={st.checkName} numberOfLines={1}>{voterName(voter, lang)}</Text>
        <Text style={st.checkMeta} numberOfLines={1}>{meta.join("  ·  ")}</Text>
      </View>
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

  stepRow: {
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 14, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepDotText: { fontSize: 12, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(12) },
  stepDotTextActive: { color: "#fff" },
  stepLabel: { fontSize: 11, color: colors.textMuted, fontFamily, lineHeight: lh(11) },
  stepLabelActive: { color: colors.text, fontWeight: "700" },

  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(13), marginBottom: 10 },

  chipRow: { gap: 8, paddingBottom: 4 },
  unitChip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 180,
  },
  unitChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitChipText: { fontSize: 13, color: colors.text, fontWeight: "600", fontFamily, lineHeight: lh(13) },
  unitChipTextActive: { color: "#fff" },

  workerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  workerRowActive: { borderColor: colors.primary, borderWidth: 2 },
  workerAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  workerInitial: { fontSize: 15, fontWeight: "700", color: colors.primary, fontFamily, lineHeight: lh(15) },
  workerName: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  workerMeta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },

  pickedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 10, marginBottom: 14,
  },
  pickedBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.primary, fontFamily, lineHeight: lh(12) },

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

  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.green, paddingHorizontal: 16, paddingVertical: 12,
  },
  successText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily, lineHeight: lh(13) },

  selectAllRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
  },
  countLine: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },
  selectAllText: { fontSize: 13, color: colors.primary, fontWeight: "700", fontFamily, lineHeight: lh(13) },

  checkRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  checkName: { fontSize: 14, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(14) },
  checkMeta: { fontSize: 11, color: colors.textMuted, fontFamily, lineHeight: lh(11), marginTop: 1 },

  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, ...shadow,
  },
  stickyError: { color: colors.danger, fontSize: 12, fontFamily, lineHeight: lh(12), marginBottom: 8, textAlign: "center" },
  assignBtn: {
    backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: 14, alignItems: "center",
  },
  assignBtnText: { color: colors.primaryDark, fontSize: 15, fontWeight: "700", fontFamily, lineHeight: lh(15) },
});
