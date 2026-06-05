import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/auth-context";
import { setLanguage } from "../../src/i18n";
import { PrimaryButton } from "../../src/components/ui";
import { colors, fontWeight, radius, shadow } from "../../src/theme";

export default function SetupProfile() {
  const { t, i18n } = useTranslation();
  const { user, api, setUser } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [designation, setDesignation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onContinue() {
    setError(undefined);
    setBusy(true);
    try {
      const updated = await api<{ name: string; designation: string; preferredLanguage: string }>(
        "/users/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            designation: designation.trim(),
            preferredLanguage: i18n.language,
          }),
        },
      );
      // Reflect the update locally so the profile tab shows fresh data
      if (user) {
        setUser({ ...user, ...updated } as typeof user);
      }
      router.push("./enable-push");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canContinue = name.trim().length >= 2;

  return (
    <SafeAreaView style={st.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={st.titleTe}>{t("onboarding.setupProfileTitleTe")}</Text>
          <Text style={st.titleEn}>{t("onboarding.setupProfileTitle")}</Text>

          <View style={st.card}>
            {/* Language toggle */}
            <Text style={st.label}>{t("onboarding.languageLabel")}</Text>
            <View style={st.langRow}>
              {(["te", "en"] as const).map((l) => (
                <Pressable
                  key={l}
                  onPress={() => setLanguage(l)}
                  style={[st.lang, i18n.language === l && st.langActive]}
                >
                  <Text style={[st.langText, i18n.language === l && st.langTextActive]}>
                    {l === "te" ? "తెలుగు" : "English"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Name */}
            <Text style={[st.label, { marginTop: 20 }]}>{t("onboarding.nameLabel")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("onboarding.namePlaceholder")}
              placeholderTextColor="#94a3b8"
              style={st.input}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Designation */}
            <Text style={st.label}>{t("onboarding.designationLabel")}</Text>
            <TextInput
              value={designation}
              onChangeText={setDesignation}
              placeholder={t("onboarding.designationPlaceholder")}
              placeholderTextColor="#94a3b8"
              style={st.input}
              autoCapitalize="words"
              returnKeyType="done"
            />

            {error ? <Text style={st.error}>{error}</Text> : null}

            <PrimaryButton
              title={t("onboarding.continueBtn")}
              onPress={onContinue}
              loading={busy}
              disabled={!canContinue}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  titleTe: {
    fontSize: 28,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
  },
  titleEn: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.textMutedOnDark,
    textAlign: "center",
    marginBottom: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    ...shadow,
    shadowColor: "#000",
    shadowOpacity: 0.25,
  },
  label: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  langRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  lang: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.textMuted, fontWeight: fontWeight.semibold },
  langTextActive: { color: "#fff" },
  error: {
    color: colors.danger,
    marginBottom: 14,
    textAlign: "center",
    fontWeight: fontWeight.semibold,
  },
});
