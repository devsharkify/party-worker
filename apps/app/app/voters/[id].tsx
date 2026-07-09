import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { StateView } from "../../src/components/StateView";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { VoterRow } from "../../src/components/VoterRow";
import { ChangeChips } from "../../src/components/ChangeChips";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import { timeAgo } from "../../src/lib/field";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  voterName,
  type Voter,
  type VoterDetail,
  type VoterHistoryEntry,
  type VotingStatus,
} from "../../src/lib/voters";

const MARKABLE: Array<Exclude<VotingStatus, "unmarked">> = ["green", "yellow", "red"];

/** Voter detail — status marking, election-day voted toggle, contact edit, family. */
export default function VoterDetailScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const { id } = useLocalSearchParams<{ id: string }>();

  const [voter, setVoter] = useState<Voter | null>(null);
  const [family, setFamily] = useState<Voter[]>([]);
  const [history, setHistory] = useState<VoterHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!id) return;
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api<VoterDetail>(`/voters/detail/${id}`);
        setVoter(res.voter);
        setFamily(res.family);
        setMobile(res.voter.mobile ?? "");
        setNotes(res.voter.notes ?? "");
        // History is supplementary — never block the detail view on it.
        try {
          const h = await api<{ items: VoterHistoryEntry[] }>(`/voters/detail/${id}/history`);
          setHistory(h.items);
        } catch {
          setHistory([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>): Promise<Voter> {
    return api<Voter>(`/voters/detail/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  }

  /** Optimistic status mark — revert on failure. */
  async function markStatus(next: VotingStatus) {
    if (!voter) return;
    const prev = voter;
    const target: VotingStatus = voter.votingStatus === next ? "unmarked" : next;
    setVoter({ ...voter, votingStatus: target });
    setSaveError(null);
    try {
      const updated = await patch({ votingStatus: target });
      setVoter(updated);
    } catch (e) {
      setVoter(prev);
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Optimistic voted toggle — revert on failure. */
  async function toggleVoted(value: boolean) {
    if (!voter) return;
    const prev = voter;
    setVoter({ ...voter, isVoted: value });
    setSaveError(null);
    try {
      const updated = await patch({ isVoted: value });
      setVoter(updated);
    } catch (e) {
      setVoter(prev);
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveContact() {
    if (!voter || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patch({ mobile: mobile.trim() || null, notes: notes.trim() || null });
      setVoter(updated);
      setMobile(updated.mobile ?? "");
      setNotes(updated.notes ?? "");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function openSurvey() {
    if (!voter) return;
    const householdName = voter.relationName || voter.nameEn;
    router.push(
      `/voters/survey?voterId=${encodeURIComponent(voter.id)}&householdName=${encodeURIComponent(householdName)}`,
    );
  }

  const title = lang === "te" ? "ఓటరు వివరాలు" : "Voter Detail";
  const contactDirty =
    voter != null && (mobile.trim() !== (voter.mobile ?? "") || notes.trim() !== (voter.notes ?? ""));

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          <SkeletonBlock height={64} rounded={radius.lg} style={{ marginTop: 12 }} />
          <SkeletonBlock height={160} rounded={radius.lg} style={{ marginTop: 12 }} />
        </View>
      ) : error || !voter ? (
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
          contentContainerStyle={st.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {/* Identity card */}
          <View style={st.card}>
            <Text style={st.name}>{voterName(voter, lang)}</Text>
            {lang === "te" && voter.nameTe ? <Text style={st.altName}>{voter.nameEn}</Text> : null}
            <View style={st.fieldGrid}>
              <Field label="EPIC" value={voter.epicNo} />
              <Field label={lang === "te" ? "క్రమ సంఖ్య" : "Serial"} value={voter.serialNo} />
              <Field label={lang === "te" ? "భాగం" : "Part"} value={voter.partNo} />
              <Field label={lang === "te" ? "సెక్షన్" : "Section"} value={voter.sectionNo} />
              <Field label={lang === "te" ? "వయసు" : "Age"} value={voter.age} />
              <Field label={lang === "te" ? "లింగం" : "Gender"} value={voter.gender} />
              <Field
                label={
                  voter.relationType === "father"
                    ? lang === "te" ? "తండ్రి" : "Father"
                    : voter.relationType === "husband"
                      ? lang === "te" ? "భర్త" : "Husband"
                      : lang === "te" ? "సంబంధీకుడు" : "Relation"
                }
                value={voter.relationName}
                wide
              />
              <Field label={lang === "te" ? "ఇంటి నంబర్" : "House No"} value={voter.houseNo} />
              <Field label={lang === "te" ? "చిరునామా" : "Address"} value={voter.address} wide />
            </View>
          </View>

          {saveError ? <Text style={st.saveError}>⚠️ {saveError}</Text> : null}

          {/* Status buttons */}
          <Text style={st.sectionTitle}>{lang === "te" ? "మద్దతు స్థితి" : "Support status"}</Text>
          <View style={st.statusRow}>
            {MARKABLE.map((s) => {
              const active = voter.votingStatus === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => void markStatus(s)}
                  style={({ pressed }) => [
                    st.statusBtn,
                    { borderColor: STATUS_COLORS[s] },
                    active && { backgroundColor: STATUS_COLORS[s] },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[st.statusBtnTextTe, { color: active ? "#fff" : STATUS_COLORS[s] }]}>
                    {STATUS_LABELS[s].te}
                  </Text>
                  <Text style={[st.statusBtnTextEn, { color: active ? "#fff" : STATUS_COLORS[s] }]}>
                    {STATUS_LABELS[s].en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Voted toggle */}
          <View style={st.votedRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.votedLabel}>{lang === "te" ? "ఓటు వేశారు" : "Voted"}</Text>
              <Text style={st.votedHint}>
                {lang === "te" ? "ఎన్నికల రోజు గుర్తించండి" : "Mark on election day"}
              </Text>
            </View>
            <Switch
              value={voter.isVoted}
              onValueChange={(v) => void toggleVoted(v)}
              trackColor={{ true: STATUS_COLORS.green, false: colors.border }}
              thumbColor="#fff"
            />
          </View>

          {/* Contact */}
          <Text style={st.sectionTitle}>{lang === "te" ? "సంప్రదింపు" : "Contact"}</Text>
          <Text style={st.inputLabel}>{lang === "te" ? "మొబైల్" : "Mobile"}</Text>
          <TextInput
            style={st.input}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="9XXXXXXXXX"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={st.inputLabel}>{lang === "te" ? "గమనికలు" : "Notes"}</Text>
          <TextInput
            style={[st.input, { minHeight: 72, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder={lang === "te" ? "ఏదైనా సమాచారం" : "Any notes"}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={() => void saveContact()}
            disabled={!contactDirty || saving}
            style={({ pressed }) => [
              st.saveBtn,
              (!contactDirty || saving) && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={st.saveBtnText}>
              {saving ? "…" : lang === "te" ? "సేవ్ చేయండి" : "Save"}
            </Text>
          </Pressable>

          {/* Family */}
          <Text style={st.sectionTitle}>
            {lang === "te" ? "కుటుంబ సభ్యులు" : "Family members"}
            {family.length > 0 ? ` (${family.length})` : ""}
          </Text>
          {family.length === 0 ? (
            <Text style={st.emptyFamily}>
              {lang === "te" ? "ఇదే ఇంట్లో ఇతర ఓటర్లు లేరు" : "No other voters in this house"}
            </Text>
          ) : (
            family.map((f) => (
              <VoterRow key={f.id} voter={f} lang={lang} onPress={() => router.push(`/voters/${f.id}`)} />
            ))
          )}

          {/* Edit history */}
          <Text style={st.sectionTitle}>
            {lang === "te" ? "మార్పుల చరిత్ర" : "History"}
            {history.length > 0 ? ` (${history.length})` : ""}
          </Text>
          {history.length === 0 ? (
            <Text style={st.emptyFamily}>
              {lang === "te" ? "ఇంకా మార్పులు జరగలేదు" : "No changes yet"}
            </Text>
          ) : (
            history.map((h) => (
              <View key={h.id} style={st.historyCard}>
                <View style={st.historyTop}>
                  <Text style={st.historyUser} numberOfLines={1}>
                    {h.user.name}
                  </Text>
                  <Text style={st.historyTime}>{timeAgo(h.createdAt, lang)}</Text>
                </View>
                <ChangeChips changes={h.changes} />
              </View>
            ))
          )}

          {/* Household survey */}
          <Pressable onPress={openSurvey} style={({ pressed }) => [st.surveyBtn, pressed && { opacity: 0.85 }]}>
            <Feather name="clipboard" size={18} color="#fff" />
            <Text style={st.surveyBtnText}>
              {lang === "te" ? "ఈ కుటుంబాన్ని సర్వే చేయండి (+10 పాయింట్లు)" : "Survey this household (+10 pts)"}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | number | null | undefined;
  wide?: boolean;
}) {
  return (
    <View style={[fld.wrap, wide && { width: "100%" }]}>
      <Text style={fld.label}>{label}</Text>
      <Text style={fld.value}>{value != null && value !== "" ? String(value) : "—"}</Text>
    </View>
  );
}

const fld = StyleSheet.create({
  wrap: { width: "47%" },
  label: { fontSize: 11, color: colors.textMuted, fontFamily, lineHeight: lh(11) },
  value: { fontSize: 14, fontWeight: "600", color: colors.text, fontFamily, lineHeight: lh(14), marginTop: 2 },
});

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  content: { padding: 16, paddingBottom: 48 },

  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 16, ...shadow,
  },
  name: { fontSize: 19, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(19) },
  altName: { fontSize: 13, color: colors.textMuted, fontFamily, lineHeight: lh(13), marginTop: 2 },
  fieldGrid: {
    flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 12, marginTop: 14,
  },

  saveError: { color: colors.danger, fontSize: 13, fontFamily, lineHeight: lh(13), marginTop: 12 },

  sectionTitle: {
    fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily, lineHeight: lh(14),
    marginTop: 22, marginBottom: 10,
  },
  statusRow: { flexDirection: "row", gap: 10 },
  statusBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderWidth: 2, borderRadius: radius.lg, backgroundColor: colors.card,
  },
  statusBtnTextTe: { fontSize: 15, fontWeight: "700", fontFamily, lineHeight: lh(15) },
  statusBtnTextEn: { fontSize: 11, fontWeight: "600", fontFamily, lineHeight: lh(11), marginTop: 1 },

  votedRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14,
  },
  votedLabel: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(15) },
  votedHint: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 1 },

  inputLabel: {
    fontSize: 13, fontWeight: "600", color: colors.textMuted, fontFamily, lineHeight: lh(13),
    marginBottom: 6, marginTop: 10,
  },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text, fontFamily,
  },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingVertical: 12, alignItems: "center", marginTop: 14,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily, lineHeight: lh(15) },

  emptyFamily: { fontSize: 13, color: colors.textMuted, fontFamily, lineHeight: lh(13) },

  historyCard: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  historyUser: {
    flexShrink: 1, fontSize: 14, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(14),
  },
  historyTime: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },

  surveyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: colors.gold, borderRadius: radius.pill,
    paddingVertical: 14, marginTop: 26, ...shadow,
  },
  surveyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14, fontFamily, lineHeight: lh(14) },
});
