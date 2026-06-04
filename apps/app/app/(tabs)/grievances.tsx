import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  CreateGrievanceDto,
  GrievanceCreated,
  GrievanceStatus,
  GrievanceSummary,
} from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { Card, Pill, PrimaryButton, Screen } from "../../src/components/ui";
import { colors, radius } from "../../src/theme";

const CATEGORY_KEYS = [
  "catRoads",
  "catWater",
  "catPower",
  "catSanitation",
  "catHealth",
  "catOther",
] as const;

const STATUS_COLOR: Record<GrievanceStatus, string> = {
  open: colors.textMuted,
  routed: colors.primary,
  in_progress: colors.primaryDark,
  resolved: colors.success,
  rejected: colors.danger,
};

export default function Grievances() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const mine = useApi<GrievanceSummary[]>("/grievances/mine");

  const [category, setCategory] = useState<(typeof CATEGORY_KEYS)[number]>("catRoads");
  const [description, setDescription] = useState("");
  const [citizenName, setCitizenName] = useState("");
  const [citizenPhone, setCitizenPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setDone(false);
    try {
      const body: CreateGrievanceDto = {
        title: t(`grievances.${category}`),
        description: description.trim() || undefined,
        citizenName: citizenName.trim() || undefined,
        citizenPhone: citizenPhone.trim() || undefined,
      };
      await api<GrievanceCreated>("/grievances", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDescription("");
      setCitizenName("");
      setCitizenPhone("");
      setDone(true);
      mine.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Text style={st.formTitle}>{t("grievances.newTitle")}</Text>

        <Text style={st.label}>{t("grievances.category")}</Text>
        <View style={st.catWrap}>
          {CATEGORY_KEYS.map((key) => {
            const active = category === key;
            return (
              <Pressable
                key={key}
                onPress={() => setCategory(key)}
                style={[st.cat, active && st.catActive]}
              >
                <Text style={[st.catText, active && st.catTextActive]}>{t(`grievances.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={st.label}>{t("grievances.description")}</Text>
        <TextInput
          style={[st.input, st.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder={t("grievances.descriptionPlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={st.label}>{t("grievances.citizenName")}</Text>
        <TextInput
          style={st.input}
          value={citizenName}
          onChangeText={setCitizenName}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={st.label}>{t("grievances.citizenPhone")}</Text>
        <TextInput
          style={st.input}
          value={citizenPhone}
          onChangeText={setCitizenPhone}
          keyboardType="phone-pad"
          placeholderTextColor={colors.textMuted}
        />

        <View style={{ marginTop: 16 }}>
          <PrimaryButton title={t("grievances.submit")} onPress={submit} loading={busy} />
        </View>
        {done ? <Text style={st.done}>✓ {t("grievances.submitted")}</Text> : null}
      </Card>

      <Text style={st.sectionTitle}>{t("grievances.mine")}</Text>
      {mine.data && mine.data.length === 0 ? (
        <Text style={st.empty}>{t("grievances.empty")}</Text>
      ) : null}
      {(mine.data ?? []).map((g) => (
        <Card key={g.id}>
          <View style={st.row}>
            <Text style={st.gTitle} numberOfLines={1}>
              {g.title}
            </Text>
            <Pill label={t(`grievances.status.${g.status}`)} color={STATUS_COLOR[g.status]} />
          </View>
          <Text style={st.gDate}>{new Date(g.createdAt).toLocaleDateString()}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  formTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 12, marginBottom: 6 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cat: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
  },
  catActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catText: { fontWeight: "700", color: colors.text, fontSize: 13 },
  catTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fff",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  done: { marginTop: 12, textAlign: "center", color: colors.success, fontWeight: "800" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 8, marginBottom: 10 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 12, marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  gTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  gDate: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
});
