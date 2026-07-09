import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import type { FamilyMemberInput } from "../../src/lib/voters";

interface FamilyRow {
  name: string;
  age: string;
  relation: string;
  isVoter: boolean;
}

const RELIGION_OPTIONS = [
  { value: "hindu", te: "హిందూ", en: "Hindu" },
  { value: "muslim", te: "ముస్లిం", en: "Muslim" },
  { value: "christian", te: "క్రైస్తవ", en: "Christian" },
  { value: "other", te: "ఇతర", en: "Other" },
];

const SUPPORT_OPTIONS = [
  { value: "strong", te: "బలమైన మద్దతు", en: "Strong" },
  { value: "leaning", te: "మొగ్గు", en: "Leaning" },
  { value: "neutral", te: "తటస్థ", en: "Neutral" },
  { value: "opposed", te: "వ్యతిరేకం", en: "Opposed" },
];

const INCOME_OPTIONS = [
  { value: "<10k", te: "₹10 వేల లోపు", en: "<10k" },
  { value: "10-25k", te: "₹10–25 వేలు", en: "10–25k" },
  { value: "25-50k", te: "₹25–50 వేలు", en: "25–50k" },
  { value: "50k+", te: "₹50 వేలు+", en: "50k+" },
];

const HOUSING_OPTIONS = [
  { value: "owned", te: "సొంత ఇల్లు", en: "Owned" },
  { value: "rented", te: "అద్దె", en: "Rented" },
  { value: "other", te: "ఇతర", en: "Other" },
];

/** Household survey form — +10 pts awarded server-side on submit. */
export default function VoterSurvey() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const params = useLocalSearchParams<{
    voterId?: string;
    boothId?: string;
    householdName?: string;
  }>();

  const [householdName, setHouseholdName] = useState(params.householdName ?? "");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [religion, setReligion] = useState<string | null>(null);
  const [caste, setCaste] = useState("");
  const [familyCount, setFamilyCount] = useState(1);
  const [members, setMembers] = useState<FamilyRow[]>([]);
  const [knowsLocalLeader, setKnowsLocalLeader] = useState(false);
  const [currentPartySupport, setCurrentPartySupport] = useState("");
  const [supportLevel, setSupportLevel] = useState<string | null>(null);
  const [servicesReceived, setServicesReceived] = useState("");
  const [incomeRange, setIncomeRange] = useState<string | null>(null);
  const [mainOccupation, setMainOccupation] = useState("");
  const [housingType, setHousingType] = useState<string | null>(null);
  const [issues, setIssues] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addMember() {
    setMembers((m) => [...m, { name: "", age: "", relation: "", isVoter: false }]);
  }
  function removeMember(idx: number) {
    setMembers((m) => m.filter((_, i) => i !== idx));
  }
  function updateMember(idx: number, patch: Partial<FamilyRow>) {
    setMembers((m) => m.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function resetForm() {
    setHouseholdName("");
    setMobile("");
    setAddress("");
    setReligion(null);
    setCaste("");
    setFamilyCount(1);
    setMembers([]);
    setKnowsLocalLeader(false);
    setCurrentPartySupport("");
    setSupportLevel(null);
    setServicesReceived("");
    setIncomeRange(null);
    setMainOccupation("");
    setHousingType(null);
    setIssues("");
  }

  async function submit() {
    if (!householdName.trim() || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const familyDetails: FamilyMemberInput[] = members
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name.trim(),
          age: m.age.trim() ? Number(m.age.trim()) : undefined,
          relation: m.relation.trim() || undefined,
          isVoter: m.isVoter,
        }));
      await api("/voters/surveys", {
        method: "POST",
        body: JSON.stringify({
          ...(params.boothId ? { boothId: params.boothId } : {}),
          ...(params.voterId ? { voterId: params.voterId } : {}),
          householdName: householdName.trim(),
          mobile: mobile.trim() || undefined,
          address: address.trim() || undefined,
          religion: religion ?? undefined,
          caste: caste.trim() || undefined,
          familyMembersCount: familyCount,
          familyDetails: familyDetails.length > 0 ? familyDetails : undefined,
          knowsLocalLeader,
          currentPartySupport: currentPartySupport.trim() || undefined,
          supportLevel: supportLevel ?? undefined,
          servicesReceived: servicesReceived.trim() || undefined,
          incomeRange: incomeRange ?? undefined,
          mainOccupation: mainOccupation.trim() || undefined,
          housingType: housingType ?? undefined,
          issues: issues.trim() || undefined,
        }),
      });
      setDone(true);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const title = lang === "te" ? "కుటుంబ సర్వే" : "Household Survey";

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={st.successBanner}>
            <Text style={st.successText}>
              {lang === "te" ? "✓ సర్వే నమోదైంది! +10 పాయింట్లు" : "✓ Survey saved! +10 pts"}
            </Text>
          </View>
        ) : null}
        {error ? <Text style={st.errorText}>⚠️ {error}</Text> : null}

        <Label text={lang === "te" ? "కుటుంబ పెద్ద పేరు *" : "Household head name *"} />
        <TextInput
          style={st.input}
          value={householdName}
          onChangeText={setHouseholdName}
          placeholder={lang === "te" ? "పేరు" : "Name"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "మొబైల్" : "Mobile"} />
        <TextInput
          style={st.input}
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          placeholder="9XXXXXXXXX"
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "చిరునామా" : "Address"} />
        <TextInput
          style={st.input}
          value={address}
          onChangeText={setAddress}
          placeholder={lang === "te" ? "ఇల్లు నంబర్, వీధి" : "House no, street"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "మతం" : "Religion"} />
        <ChipGroup options={RELIGION_OPTIONS} value={religion} onChange={setReligion} lang={lang} />

        <Label text={lang === "te" ? "కులం" : "Caste"} />
        <TextInput
          style={st.input}
          value={caste}
          onChangeText={setCaste}
          placeholder={lang === "te" ? "కులం" : "Caste"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "కుటుంబ సభ్యుల సంఖ్య" : "Family members count"} />
        <View style={st.stepper}>
          <Pressable
            onPress={() => setFamilyCount((c) => Math.max(1, c - 1))}
            style={({ pressed }) => [st.stepBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="minus" size={18} color={colors.primary} />
          </Pressable>
          <Text style={st.stepValue}>{familyCount}</Text>
          <Pressable
            onPress={() => setFamilyCount((c) => Math.min(30, c + 1))}
            style={({ pressed }) => [st.stepBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="plus" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {/* Dynamic family member rows */}
        <Label text={lang === "te" ? "కుటుంబ సభ్యుల వివరాలు" : "Family member details"} />
        {members.map((m, idx) => (
          <View key={idx} style={st.memberCard}>
            <View style={st.memberTop}>
              <TextInput
                style={[st.input, { flex: 1, marginBottom: 0 }]}
                value={m.name}
                onChangeText={(t) => updateMember(idx, { name: t })}
                placeholder={lang === "te" ? "పేరు" : "Name"}
                placeholderTextColor={colors.textMuted}
              />
              <Pressable onPress={() => removeMember(idx)} hitSlop={8} style={st.removeBtn}>
                <Feather name="trash-2" size={17} color={colors.danger} />
              </Pressable>
            </View>
            <View style={st.memberRow}>
              <TextInput
                style={[st.input, { flex: 1, marginBottom: 0 }]}
                value={m.age}
                onChangeText={(t) => updateMember(idx, { age: t.replace(/[^\d]/g, "") })}
                keyboardType="number-pad"
                placeholder={lang === "te" ? "వయసు" : "Age"}
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[st.input, { flex: 2, marginBottom: 0 }]}
                value={m.relation}
                onChangeText={(t) => updateMember(idx, { relation: t })}
                placeholder={lang === "te" ? "సంబంధం" : "Relation"}
                placeholderTextColor={colors.textMuted}
              />
              <View style={st.voterSwitch}>
                <Text style={st.voterSwitchLabel}>{lang === "te" ? "ఓటరు" : "Voter"}</Text>
                <Switch
                  value={m.isVoter}
                  onValueChange={(v) => updateMember(idx, { isVoter: v })}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </View>
        ))}
        <Pressable onPress={addMember} style={({ pressed }) => [st.addMemberBtn, pressed && { opacity: 0.8 }]}>
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={st.addMemberText}>{lang === "te" ? "సభ్యుడిని జోడించండి" : "Add member"}</Text>
        </Pressable>

        <View style={st.switchRow}>
          <Text style={st.switchLabel}>
            {lang === "te" ? "స్థానిక నాయకుడు తెలుసా?" : "Knows local leader?"}
          </Text>
          <Switch
            value={knowsLocalLeader}
            onValueChange={setKnowsLocalLeader}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>

        <Label text={lang === "te" ? "ప్రస్తుత పార్టీ మద్దతు" : "Current party support"} />
        <TextInput
          style={st.input}
          value={currentPartySupport}
          onChangeText={setCurrentPartySupport}
          placeholder={lang === "te" ? "ఏ పార్టీ?" : "Which party?"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "మద్దతు స్థాయి" : "Support level"} />
        <ChipGroup options={SUPPORT_OPTIONS} value={supportLevel} onChange={setSupportLevel} lang={lang} />

        <Label text={lang === "te" ? "పొందిన పథకాలు/సేవలు" : "Services / schemes received"} />
        <TextInput
          style={st.input}
          value={servicesReceived}
          onChangeText={setServicesReceived}
          placeholder={lang === "te" ? "ఉదా: రైతుబంధు, పెన్షన్" : "e.g. Rythu Bandhu, pension"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "నెలవారీ ఆదాయం" : "Income range"} />
        <ChipGroup options={INCOME_OPTIONS} value={incomeRange} onChange={setIncomeRange} lang={lang} />

        <Label text={lang === "te" ? "ప్రధాన వృత్తి" : "Main occupation"} />
        <TextInput
          style={st.input}
          value={mainOccupation}
          onChangeText={setMainOccupation}
          placeholder={lang === "te" ? "ఉదా: వ్యవసాయం" : "e.g. farming"}
          placeholderTextColor={colors.textMuted}
        />

        <Label text={lang === "te" ? "నివాసం" : "Housing"} />
        <ChipGroup options={HOUSING_OPTIONS} value={housingType} onChange={setHousingType} lang={lang} />

        <Label text={lang === "te" ? "సమస్యలు" : "Issues"} />
        <TextInput
          style={[st.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={issues}
          onChangeText={setIssues}
          multiline
          placeholder={lang === "te" ? "ఈ కుటుంబం ఎదుర్కొంటున్న సమస్యలు" : "Problems this household faces"}
          placeholderTextColor={colors.textMuted}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!householdName.trim() || busy}
          style={({ pressed }) => [
            st.submitBtn,
            (!householdName.trim() || busy) && { opacity: 0.5 },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={st.submitText}>
            {busy ? "…" : lang === "te" ? "సర్వే నమోదు చేయండి (+10 పాయింట్లు)" : "Submit survey (+10 pts)"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={st.label}>{text}</Text>;
}

function ChipGroup({
  options,
  value,
  onChange,
  lang,
}: {
  options: Array<{ value: string; te: string; en: string }>;
  value: string | null;
  onChange: (v: string | null) => void;
  lang: "te" | "en";
}) {
  return (
    <View style={st.chipWrap}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(active ? null : o.value)}
            style={({ pressed }) => [st.chip, active && st.chipActive, pressed && { opacity: 0.8 }]}
          >
            <Text style={[st.chipText, active && st.chipTextActive]}>{lang === "te" ? o.te : o.en}</Text>
          </Pressable>
        );
      })}
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
  content: { padding: 20, paddingBottom: 60 },

  successBanner: { backgroundColor: "#166534", borderRadius: radius.lg, padding: 14, marginBottom: 16 },
  successText: { color: "#bbf7d0", fontWeight: "700", fontFamily, lineHeight: lh(14) },
  errorText: { color: colors.danger, fontSize: 13, fontFamily, lineHeight: lh(13), marginBottom: 12 },

  label: {
    fontSize: 13, fontWeight: "600", color: colors.textMuted, fontFamily, lineHeight: lh(13),
    marginBottom: 6, marginTop: 14,
  },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text, fontFamily,
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text, fontFamily, lineHeight: lh(13) },
  chipTextActive: { color: "#fff" },

  stepper: {
    flexDirection: "row", alignItems: "center", gap: 18, alignSelf: "flex-start",
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 6,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  stepValue: {
    fontSize: 17, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(17),
    minWidth: 28, textAlign: "center",
  },

  memberCard: {
    backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 10, marginBottom: 10, gap: 8,
  },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeBtn: { padding: 8 },
  voterSwitch: { alignItems: "center" },
  voterSwitchLabel: { fontSize: 10, color: colors.textMuted, fontFamily, lineHeight: lh(10), marginBottom: 2 },
  addMemberBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.primary, borderStyle: "dashed",
    borderRadius: radius.md, paddingVertical: 10,
  },
  addMemberText: { color: colors.primary, fontSize: 13, fontWeight: "600", fontFamily, lineHeight: lh(13) },

  switchRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginTop: 18,
  },
  switchLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, fontFamily, lineHeight: lh(14) },

  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: "center", marginTop: 28, ...shadow,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily, lineHeight: lh(15) },
});
