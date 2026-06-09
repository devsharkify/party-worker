import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { ConsentState } from "@pw/shared";
import { ConsentPurpose } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { PrimaryButton } from "../../src/components/ui";
import { colors, fontWeight, radius, shadow } from "../../src/theme";

const CONSENT_META: Record<ConsentPurpose, { label: string; description: string }> = {
  data_processing: {
    label: "Data Processing",
    description: "Allow us to process your activity data to personalise your experience and measure your impact.",
  },
  social_linking: {
    label: "Social Account Linking",
    description: "Connect your Instagram or Facebook accounts to unlock reach-based scoring.",
  },
  content_resharing: {
    label: "Content Resharing",
    description: "Allow the app to reshare content on your behalf via connected social accounts.",
  },
  location: {
    label: "Location Access",
    description: "Use your location to show nearby events and to tag grievances accurately.",
  },
};

export default function ConsentScreen() {
  const router = useRouter();
  const { api } = useAuth();

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
        <Text style={st.titleEn}>Privacy &amp; Data Consent</Text>
        <Text style={st.subtitle}>
          Under India&apos;s Digital Personal Data Protection Act (DPDP), you have the right to
          control how your data is used. You can change these at any time from your profile.
        </Text>

        {/* Consent toggles */}
        <View style={st.card}>
          {purposes.map((purpose, idx) => {
            const meta = CONSENT_META[purpose];
            const isLast = idx === purposes.length - 1;
            return (
              <View key={purpose} style={[st.row, !isLast && st.rowBorder]}>
                <View style={st.rowText}>
                  <Text style={st.rowLabel}>{meta.label}</Text>
                  <Text style={st.rowDesc}>{meta.description}</Text>
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

        <Text style={st.legalNote}>
          You can continue without granting any consents. Certain features may be limited until
          consent is given.
        </Text>

        {/* CTA */}
        <View style={st.bottom}>
          <PrimaryButton
            title={saving ? "Saving..." : "Continue"}
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
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
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
  },
  rowDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  legalNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  bottom: {
    width: "100%",
  },
});
