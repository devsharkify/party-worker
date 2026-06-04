import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { DeviceTier, FeedItem } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { PrimaryButton } from "../../src/components/ui";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { captureComposite } from "../../src/lib/composite";
import { colors, radius } from "../../src/theme";

/** Crude device-tier detection — native would use RAM/SoC; web is treated as high. */
function detectTier(): DeviceTier {
  return Platform.OS === "web" ? "high" : "mid";
}

export default function Personalize() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, api } = useAuth();
  const router = useRouter();
  const { data: item, loading, error, reload } = useApi<FeedItem>(`/feed/${id}`);
  const [reported, setReported] = useState(false);

  // On open: composite the personalized poster (web canvas) and upload it, so the
  // shared image is real. If capture isn't possible (native, or CORS-tainted),
  // fall back to reporting a preview-only render.
  useEffect(() => {
    if (!item || reported) return;
    setReported(true);
    void (async () => {
      let dataUrl: string | undefined;
      try {
        const out = await captureComposite({
          sourceUrl: item.sourceUrl,
          photoUrl: user?.photoUrl,
          name: user?.name ?? "",
          designation: user?.designation,
          booth: user?.boothName ?? user?.orgUnitName ?? "",
          aiLabel: t("common.aiLabelText"),
        });
        dataUrl = out ?? undefined;
      } catch {
        /* ignore capture failure */
      }
      await api(`/feed/${id}/render`, {
        method: "POST",
        body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: !dataUrl, dataUrl }),
      }).catch(() => undefined);
    })();
  }, [item, reported, api, id, user, t]);

  if (error && !item) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: t("personalize.title") }} />
        <StateView
          glyph="⚠️"
          tone="error"
          dark
          title={t("personalize.title")}
          message={error}
          retryLabel={t("common.retry")}
          onRetry={reload}
        />
      </View>
    );
  }

  if (loading || !item) {
    return (
      <View style={st.wrap}>
        <Stack.Screen options={{ title: t("personalize.title") }} />
        <SkeletonBlock width={120} height={16} dark style={{ marginBottom: 14 }} />
        <SkeletonBlock width="100%" height={420} rounded={radius.lg} dark style={{ maxWidth: 340 }} />
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <Stack.Screen options={{ title: t("personalize.title") }} />
      <View style={st.readyPill}>
        <Text style={st.ready}>● {t("personalize.ready")}</Text>
      </View>

      {/* On-device composite preview: HQ asset + the worker's photo/name/booth + burned AI label */}
      <View style={st.canvas}>
        <Image
          source={{ uri: item.sourceUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
        />
        <View style={st.scrim} />
        <View style={st.identity}>
          <View style={st.photoWrap}>
            <RemoteImage uri={user?.photoUrl} width={64} height={64} radius={32} placeholderColor="#cbd5e1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>
              {user?.name}
            </Text>
            {user?.designation ? (
              <Text style={st.designation} numberOfLines={1}>
                {user.designation}
              </Text>
            ) : null}
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
      <View style={st.btnWrap}>
        <PrimaryButton title={t("common.share")} onPress={() => router.push(`/share/${id}`)} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  readyPill: {
    backgroundColor: "rgba(255,213,74,0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  ready: { color: colors.gold, fontWeight: "800", fontSize: 13 },
  canvas: {
    width: "100%",
    maxWidth: 340,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.22)" },
  identity: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: "12%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoWrap: { borderRadius: 35, borderWidth: 3, borderColor: "#fff", padding: 0, overflow: "hidden" },
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
  btnWrap: { width: "100%", maxWidth: 340 },
});
