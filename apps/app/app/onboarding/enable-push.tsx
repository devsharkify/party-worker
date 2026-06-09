import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { PrimaryButton } from "../../src/components/ui";
import { markOnboarded } from "../../src/lib/onboarding";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../../src/theme";
import { useAuth } from "../../src/auth/auth-context";

type PermState = "idle" | "granted" | "denied";

export default function EnablePush() {
  const { t } = useTranslation();
  const router = useRouter();
  const { api } = useAuth();
  const [permState, setPermState] = useState<PermState>("idle");
  const [busy, setBusy] = useState(false);

  async function onEnable() {
    setBusy(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const result: PermState = status === "granted" ? "granted" : "denied";
      setPermState(result);

      // Register the Expo push token with the API — native only
      if (result === "granted" && Platform.OS !== "web") {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId:
              Constants.expoConfig?.extra?.eas?.projectId ?? "party-worker",
          });
          await api("/push/token", {
            method: "POST",
            body: JSON.stringify({ token: tokenData.data, platform: Platform.OS }),
          });
        } catch {
          // Non-critical — token registration failure should not block onboarding
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    await markOnboarded();
    router.replace("/(tabs)/feed");
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.wrap}>
        <View style={st.topSection}>
          <View style={st.iconRing}>
            <Feather name="bell" size={48} color={colors.primary} />
          </View>
          <Text style={st.titleTe}>{t("onboarding.enableNotifTitleTe")}</Text>
          <Text style={st.titleEn}>{t("onboarding.enableNotifTitle")}</Text>
          <Text style={st.body}>{t("onboarding.enableNotifBody")}</Text>
        </View>

        <View style={st.statusArea}>
          {permState === "granted" && (
            <View style={st.statusRow}>
              <Feather name="check" size={20} color={colors.success} />
              <Text style={st.statusTextGranted}>{t("onboarding.notifGranted")}</Text>
            </View>
          )}
          {permState === "denied" && (
            <View style={[st.statusRow, st.statusRowDenied]}>
              <Text style={st.statusTextDenied}>{t("onboarding.notifDenied")}</Text>
            </View>
          )}
        </View>

        <View style={st.bottom}>
          {permState === "idle" && (
            <>
              <PrimaryButton
                title={t("onboarding.enableBtn")}
                onPress={onEnable}
                loading={busy}
              />
              <View style={{ height: 12 }} />
              <PrimaryButton
                title={t("onboarding.skipForNow")}
                onPress={onContinue}
                disabled={busy}
              />
            </>
          )}
          {permState !== "idle" && (
            <PrimaryButton
              title={t("onboarding.continueBtn")}
              onPress={onContinue}
            />
          )}
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
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  topSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,153,51,0.14)",
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    ...shadow,
  },
  bell: {},
  titleTe: {
    fontSize: 26,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    fontFamily: fontFamily,
    lineHeight: lh(26),
  },
  titleEn: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.textMutedOnDark,
    textAlign: "center",
    marginTop: -6,
    fontFamily: fontFamily,
    lineHeight: lh(16),
  },
  body: {
    fontSize: 16,
    color: colors.textMutedOnDark,
    textAlign: "center",
    lineHeight: 24,
    marginTop: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    fontFamily: fontFamily,
  },
  statusArea: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.green,
  },
  statusRowDenied: {
    borderColor: colors.borderOnDark,
  },
  successIcon: {},
  statusTextGranted: {
    color: colors.success,
    fontWeight: fontWeight.bold,
    fontSize: 15,
    fontFamily: fontFamily,
    lineHeight: lh(15),
  },
  statusTextDenied: {
    color: colors.textMutedOnDark,
    fontSize: 14,
    textAlign: "center",
    fontFamily: fontFamily,
    lineHeight: lh(14),
  },
  bottom: {
    width: "100%",
    paddingTop: 16,
  },
});
