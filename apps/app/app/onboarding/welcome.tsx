import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../../src/components/ui";
import { colors, fontWeight, radius, shadow } from "../../src/theme";

export default function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.wrap}>
        <View style={st.logoSection}>
          <View style={st.logoRing}>
            <Text style={st.logoEmoji}>🙏</Text>
          </View>
          <Text style={st.appName}>PARTY WORKER</Text>
          <View style={st.taglineCard}>
            <Text style={st.taglineTe}>{t("onboarding.welcomeTaglineTe")}</Text>
            <Text style={st.taglineEn}>{t("onboarding.welcomeTaglineEn")}</Text>
          </View>
        </View>

        <View style={st.bottom}>
          <PrimaryButton
            title={t("onboarding.getStarted")}
            onPress={() => router.push("./setup-profile")}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 32,
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  logoRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,153,51,0.14)",
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    ...shadow,
  },
  logoEmoji: {
    fontSize: 56,
    textAlign: "center",
    lineHeight: 68,
  },
  appName: {
    fontSize: 34,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    letterSpacing: 2,
  },
  taglineCard: {
    marginTop: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    ...shadow,
  },
  taglineTe: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.textOnDark,
    textAlign: "center",
    marginBottom: 6,
  },
  taglineEn: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.textMutedOnDark,
    textAlign: "center",
  },
  bottom: {
    width: "100%",
    paddingTop: 16,
  },
});
