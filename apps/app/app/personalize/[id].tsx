import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { DeviceTier, FeedItem } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { PrimaryButton } from "../../src/components/ui";
import { colors, radius } from "../../src/theme";

/** Crude device-tier detection — native would use RAM/SoC; web is treated as high. */
function detectTier(): DeviceTier {
  return Platform.OS === "web" ? "high" : "mid";
}

export default function Personalize() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { user, api } = useAuth();
  const router = useRouter();
  const { data: item, loading } = useApi<FeedItem>(`/feed/${id}`);
  const [reported, setReported] = useState(false);

  // Pre-render: report the on-device render as soon as the post opens (so sharing feels instant).
  useEffect(() => {
    if (item && !reported) {
      setReported(true);
      void api(`/feed/${id}/render`, {
        method: "POST",
        body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: false }),
      }).catch(() => undefined);
    }
  }, [item, reported, api, id]);

  if (loading || !item) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <Stack.Screen options={{ title: t("personalize.title") }} />
      <Text style={st.ready}>{t("personalize.ready")}</Text>

      {/* On-device composite preview: HQ asset + the worker's photo/name/booth + burned AI label */}
      <View style={st.canvas}>
        <Image source={{ uri: item.sourceUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={st.scrim} />
        <View style={st.identity}>
          <Image source={{ uri: user?.photoUrl ?? undefined }} style={st.photo} />
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={st.designation} numberOfLines={1}>
              {user?.designation}
            </Text>
            <Text style={st.booth} numberOfLines={1}>
              {user?.boothName ?? user?.orgUnitName}
            </Text>
          </View>
        </View>
        {/* Non-removable AI label band (>=10% area, per IT Rules) */}
        <View style={st.aiBand}>
          <Text style={st.aiText}>{t("common.aiLabelText")}</Text>
        </View>
      </View>

      <Text style={st.fallbackNote}>{t("personalize.fallbackNote")}</Text>
      <PrimaryButton title={t("common.share")} onPress={() => router.push(`/share/${id}`)} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  ready: { color: colors.gold, fontWeight: "700", marginBottom: 12 },
  canvas: {
    width: "100%",
    maxWidth: 340,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  identity: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: "12%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photo: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: "#fff", backgroundColor: "#ccc" },
  name: { color: "#fff", fontSize: 22, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 6 },
  designation: { color: colors.gold, fontSize: 14, fontWeight: "700" },
  booth: { color: "#fff", fontSize: 13 },
  aiBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "7%",
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  fallbackNote: { color: colors.textMutedOnDark, fontSize: 12, marginVertical: 14 },
});
