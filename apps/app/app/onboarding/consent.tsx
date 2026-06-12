import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { ConsentState } from "@pw/shared";
import { ConsentPurpose } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { PrimaryButton } from "../../src/components/ui";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../../src/theme";

/** Catalog key per purpose — DPDP rules require the notice in Telugu. */
const CONSENT_KEY: Record<ConsentPurpose, string> = {
  data_processing: "consent.dataProcessing",
  social_linking: "consent.socialLinking",
  content_resharing: "consent.contentResharing",
  location: "consent.location",
};

export default function ConsentScreen() {
  const router = useRouter();
  const { api } = useAuth();
  const { t } = useTranslation();

  // Default all toggles to false — user must explicitly grant
  const purposes = ConsentPurpose.options;
  const [granted, setGranted] = useState<Record<ConsentPurpose, boolean>>(
    Object.fromEntries(purposes.map((p) => [p, false])) as Record<ConsentPurpose, boolean>,
  );
  const [saving, setSaving] = useState(false);

  function toggle(purpose: ConsentPurpose, value: boolean) {
    setGranted((prev) => ({ ...prev, [purpose]: value }));
  }

  async function onContinue() {
    setSaving(true);
    try {
      // Fire all consent updates in parallel — failures are non-critical
      await Promise.allSettled(
        purposes.map((purpose) =>
          api<ConsentState>("/me/consents", {
            method: "POST",
            body: JSON.stringify({ purpose, granted: granted[purpose] }),
          }),
        ),
      );
    } finally {
      setSaving(false);
      router.push("./enable-push");
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={st.iconRing}>
          <Feather name="shield" size={40} color={colors.primary} />
        </View>
        <Text style={st.titleEn}>{t("consent.title")}</Text>
        <Text style={st.subtitle}>{t("consent.legalNote")}</Text>
        <Text style={[st.subtitle, st.subtitleSecondary]}>{t("consent.intro")}</Text>

        {/* Consent toggles */}
        <View style={st.card}>
          {purposes.map((purpose, idx) => {
            const isLast = idx === purposes.length - 1;
            return (
              <View key={purpose} style={[st.row, !isLast && st.rowBorder]}>
                <View style={st.rowText}>
                  <Text style={st.rowLabel}>{t(CONSENT_KEY[purpose])}</Text>
                </View>
                <Switch
                  value={granted[purpose]}
                  onValueChange={(val) => toggle(purpose, val)}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                  thumbColor={granted[purpose] ? colors.primary : "#f4f4f4"}
                  ios_backgroundColor={colors.border}
                />
              </View>
            );
          })}
        </View>

        <Text style={st.legalNote}>{t("consent.skipNote")}</Text>

        {/* CTA */}
        <View style={st.bottom}>
          <PrimaryButton
            title={saving ? "…" : t("consent.agree")}
            onPress={onContinue}
            loading={saving}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    ...shadow,
  },
  titleEn: {
    fontSize: 24,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: fontFamily,
    lineHeight: lh(24),
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 12,
    fontFamily: fontFamily,
  },
  subtitleSecondary: { fontSize: 13, marginBottom: 24 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    ...shadow,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 3 },
  rowLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.text,
    fontFamily: fontFamily,
    lineHeight: lh(14),
  },
  rowDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    fontFamily: fontFamily,
  },
  legalNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 8,
    fontFamily: fontFamily,
  },
  bottom: {
    width: "100%",
  },
});
