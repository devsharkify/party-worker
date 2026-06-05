import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../../src/components/ui";
import { markOnboarded } from "../../src/lib/onboarding";
import { colors, fontWeight, radius, shadow } from "../../src/theme";

type PermState = "idle" | "granted" | "denied";

/**
 * Request notification permissions using expo-notifications.
 * The dynamic require avoids a hard compile-time dependency — the package
 * ships with the Expo managed workflow but may not be listed in package.json
 * during early development.
 */
async function requestNotifPermissions(): Promise<"granted" | "denied"> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications") as {
      requestPermissionsAsync: () => Promise<{ status: string }>;
    };
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export default function EnablePush() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permState, setPermState] = useState<PermState>("idle");
  const [busy, setBusy] = useState(false);

  async function onEnable() {
    setBusy(true);
    try {
      const result = await requestNotifPermissions();
      setPermState(result);
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
            <Text style={st.bell}>🔔</Text>
          </View>
          <Text style={st.titleTe}>{t("onboarding.enableNotifTitleTe")}</Text>
          <Text style={st.titleEn}>{t("onboarding.enableNotifTitle")}</Text>
          <Text style={st.body}>{t("onboarding.enableNotifBody")}</Text>
        </View>

        <View style={st.statusArea}>
          {permState === "granted" && (
            <View style={st.statusRow}>
              <Text style={st.successIcon}>✓</Text>
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
  bell: { fontSize: 48, textAlign: "center", lineHeight: 58 },
  titleTe: {
    fontSize: 26,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
  },
  titleEn: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.textMutedOnDark,
    textAlign: "center",
    marginTop: -6,
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
  successIcon: {
    fontSize: 20,
    color: colors.success,
    fontWeight: fontWeight.heavy,
  },
  statusTextGranted: {
    color: colors.success,
    fontWeight: fontWeight.bold,
    fontSize: 15,
  },
  statusTextDenied: {
    color: colors.textMutedOnDark,
    fontSize: 14,
    textAlign: "center",
  },
  bottom: {
    width: "100%",
    paddingTop: 16,
  },
});
