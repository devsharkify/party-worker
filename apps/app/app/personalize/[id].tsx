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
import { Feather } from "@expo/vector-icons";
import { captureComposite } from "../../src/lib/composite";
import VideoPlayer from "../../src/components/VideoPlayer";
import { WorkerBanner } from "../../src/components/WorkerBanner";
import { colors, fontFamily, lh, radius } from "../../src/theme";

function detectTier(): DeviceTier {
  return Platform.OS === "web" ? "high" : "mid";
}


// ─── Preview overlay (image) ──────────────────────────────────────────────────
function ImagePreview({
  sourceUrl, photoUrl, name, designation, area, aiLabel, canvasRef,
}: {
  sourceUrl: string; photoUrl?: string | null; name: string;
  designation: string; area: string; aiLabel: string; canvasRef: React.Ref<View>;
}) {
  return (
    <View ref={canvasRef} collapsable={false} style={st.canvas}>
      <Image source={{ uri: sourceUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
      <View style={st.scrim} />
      <View style={st.identity}>
        <View style={st.photoWrap}>
          <RemoteImage uri={photoUrl} width={64} height={64} radius={32} placeholderColor="#cbd5e1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{name || "Your Name"}</Text>
          {designation ? <Text style={st.designation} numberOfLines={1}>{designation}</Text> : null}
          <Text style={st.area} numberOfLines={1}>{area}</Text>
        </View>
      </View>
      <View style={st.aiBand}>
        <Text style={st.aiText}>{aiLabel}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function Personalize() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, api } = useAuth();
  const router = useRouter();
  const { data: item, loading, error, reload } = useApi<FeedItem>(`/feed/${id}`);
  const [reported, setReported] = useState(false);
  const canvasRef = useRef<View>(null);

  // Banner customisation state (pre-filled from profile, user can edit)
  const [bannerName, setBannerName] = useState("");
  const [bannerDesignation, setBannerDesignation] = useState("");
  const [bannerArea, setBannerArea] = useState("");
  const [bannerReady, setBannerReady] = useState(false);

  // Seed from profile once loaded
  useEffect(() => {
    if (user && !bannerReady) {
      setBannerName(user.name ?? "");
      setBannerDesignation(user.designation ?? "");
      setBannerArea(user.area ?? user.boothName ?? user.orgUnitName ?? "");
      setBannerReady(true);
    }
  }, [user, bannerReady]);

  // Personalized data URLs (for download)
  const [personalizedDataUrl, setPersonalizedDataUrl] = useState<string | null>(null);
  const [personalizedVideoUrl, setPersonalizedVideoUrl] = useState<string | null>(null);

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

  // On open: composite personalized image (images) or report preview (video)
  useEffect(() => {
    if (!item || reported || !bannerReady) return;
    setReported(true);
    void (async () => {
      if (item.type === "image") {
        let dataUrl: string | undefined;
        try {
          const out = await captureComposite(
            {
              sourceUrl: item.sourceUrl,
              photoUrl: user?.photoUrl,
              name: bannerName,
              designation: bannerDesignation,
              booth: bannerArea,
              aiLabel: t("common.aiLabelText"),
            },
            canvasRef,
          );
          dataUrl = out ?? undefined;
          if (dataUrl) setPersonalizedDataUrl(dataUrl);
        } catch { /* ignore */ }
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: !dataUrl, dataUrl }),
        }).catch(() => undefined);
      } else {
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: true }),
        }).catch(() => undefined);
      }
    })();
  }, [item, reported, bannerReady, api, id, user, bannerName, bannerDesignation, bannerArea, t]);

  async function handleCaptureVideo() {
    if (!item || videoCapturing) return;
    const { captureVideoComposite } = await import("../../src/lib/composite.video.web");
    setVideoCapturing(true);
    setVideoProgress(0);
    setVideoError(false);
    setVideoDone(false);
    try {
      const videoDataUrl = await captureVideoComposite({
        sourceUrl: item.sourceUrl,
        photoUrl: user?.photoUrl,
        name: bannerName,
        designation: bannerDesignation,
        booth: bannerArea,
        aiLabel: t("common.aiLabelText"),
        maxDurationSec: item.videoDurationSec ?? 60,
        onProgress: setVideoProgress,
      });
      if (videoDataUrl) {
        await api(`/feed/${id}/render`, {
          method: "POST",
          body: JSON.stringify({ deviceTier: detectTier(), usedServerFallback: false, videoDataUrl }),
        }).catch(() => undefined);
        setVideoDone(true);
        setPersonalizedVideoUrl(videoDataUrl);
      } else {
        setVideoError(true);
      }
    } catch {
      setVideoError(true);
    } finally {
      setVideoCapturing(false);
    }
  }

  function handleDownload() {
    const src = personalizedVideoUrl ?? personalizedDataUrl;
    if (!src || Platform.OS !== "web") return;
    const ext = personalizedVideoUrl ? "mp4" : "jpg";
    const a = document.createElement("a");
    a.href = src;
    a.download = `mytrs-${id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        <StateView  tone="error" dark title={t("personalize.title")} message={error} retryLabel={t("common.retry")} onRetry={reload} />
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
          {isVideo ? "🎬 Video creative" : "● " + t("personalize.ready")}
        </Text>
      </View>

      {/* ── Preview ── */}
      {isVideo ? (
        <VideoPlayer
          sourceUrl={item.sourceUrl}
          thumbnailUrl={item.thumbnailUrl}
          photoUrl={user?.photoUrl}
          name={bannerName}
          designation={bannerDesignation}
          booth={bannerArea}
          aiLabel={t("common.aiLabelText")}
          showControls
        />
      ) : (
        <ImagePreview
          sourceUrl={item.sourceUrl}
          photoUrl={user?.photoUrl}
          name={bannerName}
          designation={bannerDesignation}
          area={bannerArea}
          aiLabel={t("common.aiLabelText")}
          canvasRef={canvasRef}
        />
      )}

      {/* Strip banner — exactly what gets attached below the creative on share */}
      {user && (
        <View style={pb.stripWrap}>
          <WorkerBanner
            user={{
              id: user.id,
              name: user.name,
              designation: user.designation,
              photoUrl: user.photoUrl,
              tier: user.tier,
              boothName: user.boothName,
              orgUnitName: user.orgUnitName,
            }}
            width={340}
          />
        </View>
      )}

      <Text style={st.fallbackNote}>
        {isVideo
          ? "Your banner is attached below the video when shared."
          : t("personalize.fallbackNote")}
      </Text>

      {/* ── Video capture (web only) ── */}
      {isVideo && Platform.OS === "web" && (
        <View style={st.captureWrap}>
          {videoCapturing ? (
            <View style={st.progressWrap}>
              <View style={[st.progressBar, { width: `${Math.round(videoProgress * 100)}%` as unknown as number }]} />
              <Text style={st.progressText}>Personalising… {Math.round(videoProgress * 100)}%</Text>
            </View>
          ) : videoDone ? (
            <View style={st.donePill}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="check" size={14} color={colors.success} />
                <Text style={st.doneText}>Video personalised and ready to share</Text>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handleCaptureVideo}
              style={({ pressed }) => [st.captureBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Feather name={videoError ? "alert-triangle" : "video"} size={15} color="#fff" />
                <Text style={st.captureBtnText}>
                  {videoError ? "Retry personalise video" : "Personalise this video"}
                </Text>
              </View>
            </Pressable>
          )}
          {videoError && !videoCapturing && (
            <Text style={st.captionUnavailable}>
              Could not record — video may be CORS-restricted. You can still share the original.
            </Text>
          )}
        </View>
      )}

      {/* ── AI Caption ── */}
      <View style={st.captionWrap}>
        <Pressable
          onPress={handleAiCaption}
          disabled={captionLoading}
          style={({ pressed }) => [st.captionBtn, { opacity: pressed || captionLoading ? 0.75 : 1 }]}
        >
          {captionLoading
            ? <ActivityIndicator color={colors.gold} size="small" />
            : <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Feather name="zap" size={15} color={colors.gold} />
                <Text style={st.captionBtnText}>{t("personalize.aiCaption")}</Text>
              </View>
          }
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
        {(personalizedDataUrl || personalizedVideoUrl) && Platform.OS === "web" && (
          <Pressable
            onPress={handleDownload}
            style={({ pressed }) => [st.downloadBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="download" size={16} color={colors.primary} />
            <Text style={st.downloadBtnText}>
              {personalizedVideoUrl ? "Download video" : "Download image"}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: 10,
  },
  downloadBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15, fontFamily: fontFamily, lineHeight: lh(15) },
  scroll: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: 16, alignItems: "center", paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  readyPill: {
    backgroundColor: "rgba(255,213,74,0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  ready: { color: colors.gold, fontWeight: "700", fontSize: 13, fontFamily: fontFamily, lineHeight: lh(13) },
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
  name: { color: "#fff", fontSize: 22, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 6, fontFamily: fontFamily, lineHeight: lh(22) },
  designation: { color: colors.gold, fontSize: 14, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(14) },
  area: { color: "#fff", fontSize: 13, fontFamily: fontFamily, lineHeight: lh(13) },
  aiBand: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: "7%",
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiText: { color: "#fff", fontSize: 11, fontWeight: "600", fontFamily: fontFamily, lineHeight: lh(11) },
  fallbackNote: { color: colors.textMutedOnDark, fontSize: 12, marginVertical: 10, fontFamily: fontFamily, lineHeight: lh(12) },
  captureWrap: { width: "100%", maxWidth: 340, marginBottom: 12 },
  captureBtn: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  captureBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(15) },
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
    left: 0, top: 0, bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  progressText: { color: colors.textOnDark, fontSize: 14, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(14) },
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
  doneText: { color: colors.green, fontSize: 14, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(14) },
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
  captionBtnText: { color: colors.gold, fontSize: 15, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(15) },
  captionUnavailable: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 10, textAlign: "center", fontFamily: fontFamily, lineHeight: lh(13) },
  captionTextWrap: {
    marginTop: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    padding: 12,
  },
  captionScroll: { maxHeight: 120 },
  captionText: { color: colors.textOnDark, fontSize: 14, lineHeight: 22, fontFamily: fontFamily },
  captionCopyHint: { color: colors.textMutedOnDark, fontSize: 11, marginTop: 8, textAlign: "right", fontFamily: fontFamily, lineHeight: lh(11) },
  btnWrap: { width: "100%", maxWidth: 340 },
});

const pb = StyleSheet.create({
  stripWrap: {
    marginTop: 2,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    overflow: "hidden",
    alignSelf: "center",
  },
});
