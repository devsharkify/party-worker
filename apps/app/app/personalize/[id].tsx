import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
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
import VideoPlayer from "../../src/components/VideoPlayer";
import { colors, radius } from "../../src/theme";

/** Crude device-tier detection — native uses mid; web treated as high. */
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
  const canvasRef = useRef<View>(null);

  // Video capture state
  const [videoCapturing, setVideoCapturing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDone, setVideoDone] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // AI Caption state
  const [caption, setCaption] = useState<string | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);

  const isVideo = item?.type === "video";

  // On open: composite personalized image (for images) or report preview (for video).
  useEffect(() => {
    if (!item || reported) return;
    setReported(true);
    void (async () => {
      if (item.type === "image") {
        let dataUrl: string | undefined;
        try {
          const out = await captureComposite(
            {
              sourceUrl: item.sourceUrl,
              photoUrl: user?.photoUrl,
              name: user?.name ?? "",
              designation: user?.designation,
              booth: user?.boothName ?? user?.orgUnitName ?? "",
              aiLabel: t("common.aiLabelText"),
            },
            canvasRef,
          );
          dataUrl = out ?? undefined;
        } catch { /* ignore */ }
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({
            deviceTier: detectTier(),
            usedServerFallback: !dataUrl,
            dataUrl,
          }),
        }).catch(() => undefined);
      } else {
        // For video: just report the preview, no capture yet.
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: true }),
        }).catch(() => undefined);
      }
    })();
  }, [item, reported, api, id, user, t]);

  async function handleCaptureVideo() {
    if (!item || videoCapturing) return;
    // Dynamic import so the heavy canvas/MediaRecorder code only loads on web
    const { captureVideoComposite } = await import("../../src/lib/composite.video.web");
    setVideoCapturing(true);
    setVideoProgress(0);
    setVideoError(false);
    setVideoDone(false);
    try {
      const videoDataUrl = await captureVideoComposite({
        sourceUrl: item.sourceUrl,
        photoUrl: user?.photoUrl,
        name: user?.name ?? "",
        designation: user?.designation,
        booth: user?.boothName ?? user?.orgUnitName ?? "",
        aiLabel: t("common.aiLabelText"),
        maxDurationSec: item.videoDurationSec ?? 60,
        onProgress: setVideoProgress,
      });
      if (videoDataUrl) {
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({
            deviceTier: detectTier(),
            usedServerFallback: false,
            videoDataUrl,
          }),
        }).catch(() => undefined);
        setVideoDone(true);
      } else {
        setVideoError(true);
      }
    } catch {
      setVideoError(true);
    } finally {
      setVideoCapturing(false);
    }
  }

  const handleAiCaption = async () => {
    if (!item) return;
    setCaptionLoading(true);
    setCaptionError(false);
    setCaption(null);
    setCaptionCopied(false);
    try {
      const result = await api<{ caption: string }>("/ai/caption", {
        method: "POST",
        body: JSON.stringify({ title: item.title, lang: user?.preferredLanguage ?? "te" }),
      });
      setCaption(result.caption);
    } catch {
      setCaptionError(true);
    } finally {
      setCaptionLoading(false);
    }
  };

  const handleCopyCaption = async () => {
    if (!caption) return;
    await Clipboard.setStringAsync(caption);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  };

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
    <ScrollView style={st.scroll} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isVideo ? "Personalize Video" : t("personalize.title") }} />

      <View style={st.readyPill}>
        <Text style={st.ready}>
          {isVideo ? "🎬" : "●"} {isVideo ? "Video creative" : t("personalize.ready")}
        </Text>
      </View>

      {/* ---- VIDEO branch ---- */}
      {isVideo ? (
        <VideoPlayer
          sourceUrl={item.sourceUrl}
          thumbnailUrl={item.thumbnailUrl}
          photoUrl={user?.photoUrl}
          name={user?.name ?? ""}
          designation={user?.designation}
          booth={user?.boothName ?? user?.orgUnitName ?? ""}
          aiLabel={t("common.aiLabelText")}
          showControls
        />
      ) : (
        /* ---- IMAGE branch ---- */
        <View ref={canvasRef} collapsable={false} style={st.canvas}>
          <Image
            source={{ uri: item.sourceUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
          />
          <View style={st.scrim} />
          <View style={st.identity}>
            <View style={st.photoWrap}>
              <RemoteImage
                uri={user?.photoUrl}
                width={64}
                height={64}
                radius={32}
                placeholderColor="#cbd5e1"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{user?.name}</Text>
              {user?.designation ? (
                <Text style={st.designation} numberOfLines={1}>{user.designation}</Text>
              ) : null}
              <Text style={st.booth} numberOfLines={1}>
                {user?.boothName ?? user?.orgUnitName}
              </Text>
            </View>
          </View>
          <View style={st.aiBand}>
            <Text style={st.aiText}>{t("common.aiLabelText")}</Text>
          </View>
        </View>
      )}

      <Text style={st.fallbackNote}>
        {isVideo
          ? "Your name & photo will appear on the video when shared."
          : t("personalize.fallbackNote")}
      </Text>

      {/* Video capture button (web only — MediaRecorder required) */}
      {isVideo && Platform.OS === "web" && (
        <View style={st.captureWrap}>
          {videoCapturing ? (
            <View style={st.progressWrap}>
              <View style={[st.progressBar, { width: `${Math.round(videoProgress * 100)}%` as unknown as number }]} />
              <Text style={st.progressText}>
                Personalizing… {Math.round(videoProgress * 100)}%
              </Text>
            </View>
          ) : videoDone ? (
            <View style={st.donePill}>
              <Text style={st.doneText}>✓ Video personalized and ready to share</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleCaptureVideo}
              style={({ pressed }) => [st.captureBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={st.captureBtnText}>
                {videoError ? "⚠ Retry personalize video" : "🎥 Personalize this video"}
              </Text>
            </Pressable>
          )}
          {videoError && !videoCapturing && (
            <Text style={st.captionUnavailable}>
              Could not record — video may be CORS-restricted. You can still share the original.
            </Text>
          )}
        </View>
      )}

      {/* AI Caption section */}
      <View style={st.captionWrap}>
        <Pressable
          onPress={handleAiCaption}
          disabled={captionLoading}
          style={({ pressed }) => [st.captionBtn, { opacity: pressed || captionLoading ? 0.75 : 1 }]}
        >
          {captionLoading ? (
            <ActivityIndicator color={colors.gold} size="small" />
          ) : (
            <Text style={st.captionBtnText}>✨ {t("personalize.aiCaption")}</Text>
          )}
        </Pressable>

        {captionError && !captionLoading && (
          <Text style={st.captionUnavailable}>Caption unavailable</Text>
        )}

        {caption && !captionError && (
          <Pressable onPress={handleCopyCaption} style={st.captionTextWrap}>
            <ScrollView scrollEnabled style={st.captionScroll} nestedScrollEnabled>
              <Text style={st.captionText} selectable>{caption}</Text>
            </ScrollView>
            <Text style={st.captionCopyHint}>
              {captionCopied ? t("personalize.captionCopied") : "Tap to copy"}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={st.btnWrap}>
        <PrimaryButton title={t("common.share")} onPress={() => router.push(`/share/${id}`)} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: 16, alignItems: "center", paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  readyPill: {
    backgroundColor: "rgba(255,213,74,0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  ready: { color: colors.gold, fontWeight: "800", fontSize: 13 },
  // Image canvas
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
  photoWrap: { borderRadius: 35, borderWidth: 3, borderColor: "#fff", overflow: "hidden" },
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
  // Video capture
  captureWrap: { width: "100%", maxWidth: 340, marginBottom: 12 },
  captureBtn: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  captureBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  progressWrap: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  progressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  progressText: { color: colors.textOnDark, fontSize: 14, fontWeight: "700" },
  donePill: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  doneText: { color: colors.green, fontSize: 14, fontWeight: "700" },
  // AI Caption
  captionWrap: { width: "100%", maxWidth: 340, marginBottom: 16 },
  captionBtn: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: "rgba(255,213,74,0.10)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  captionBtnText: { color: colors.gold, fontSize: 15, fontWeight: "700" },
  captionUnavailable: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 10, textAlign: "center" },
  captionTextWrap: {
    marginTop: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    padding: 12,
  },
  captionScroll: { maxHeight: 120 },
  captionText: { color: colors.textOnDark, fontSize: 14, lineHeight: 22 },
  captionCopyHint: { color: colors.textMutedOnDark, fontSize: 11, marginTop: 8, textAlign: "right" },
  btnWrap: { width: "100%", maxWidth: 340 },
});
