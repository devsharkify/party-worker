import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../../src/components/ui";
import { TRSLogo } from "../../src/components/TRSLogo";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../../src/theme";

export default function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.wrap}>
        <View style={st.logoSection}>
          <View style={st.logoWrap}>
            <TRSLogo size={120} showBanner borderRadius={10} />
          </View>
          <Text style={st.appName}>myTRS</Text>
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
  logoWrap: {
    alignSelf: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  appName: {
    fontSize: 34,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    letterSpacing: 2,
    fontFamily: fontFamily,
    lineHeight: lh(34),
  },
  taglineCard: {
    marginTop: 8,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadow,
  },
  taglineTe: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.textOnDark,
    textAlign: "center",
    marginBottom: 6,
    fontFamily: fontFamily,
    lineHeight: lh(22),
  },
  taglineEn: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.textMutedOnDark,
    textAlign: "center",
    fontFamily: fontFamily,
    lineHeight: lh(15),
  },
  bottom: {
    width: "100%",
    paddingTop: 16,
  },
});
