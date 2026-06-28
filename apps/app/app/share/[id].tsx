import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import { useAuth } from "../../src/auth/auth-context";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { WorkerBanner, type BannerUser } from "../../src/components/WorkerBanner";
import { compositeVideoWithBanner } from "../../src/lib/composite.video";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";

interface ShareResponse {
  shareEventId: string;
  trackedLink: string;
  caption: string;
  basePointsAwarded: number;
  personalizedUrl: string | null;
  mediaUrl: string;
  type: "image" | "video";
  deepLinks: Record<string, string>;
}

type ShareChannel =
  | "whatsapp_status"
  | "whatsapp"
  | "instagram_story"
  | "instagram_feed"
  | "youtube"
  | "facebook"
  | "copy_link"
  | "other";

const L = {
  errorTitle: { te: "షేర్ లింక్ సిద్ధం కాలేదు", en: "Couldn't prepare your share" },
  copied: { te: "కాపీ అయింది!", en: "Copied!" },
  shareNow: { te: "పోస్టర్ షేర్ చేయండి", en: "Share poster" },
  hint: { te: "షేర్ చేసిన తర్వాత పాయింట్లు లభిస్తాయి", en: "Points are earned after you share" },
  captionCopied: {
    te: "క్యాప్షన్ కాపీ అయింది — పోస్టర్‌తో పాటు పేస్ట్ చేయండి",
    en: "Caption copied — paste it with your poster",
  },
  alreadyEarned: {
    te: "ఈ పోస్టర్‌కు పాయింట్లు ఇప్పటికే లభించాయి — మళ్లీ షేర్ చేసి రీచ్ పెంచండి",
    en: "Points already earned for this poster — share again to grow reach",
  },
  downloadShare: { te: "పోస్టర్ డౌన్‌లోడ్ + క్యాప్షన్ కాపీ", en: "Download poster + copy caption" },
  forwardPacks: { te: "ఫార్వర్డ్ పాక్స్", en: "Forward Packs" },
  packFamily: { te: "కుటుంబ గ్రూప్", en: "Family Group" },
  packColony: { te: "కాలనీ గ్రూప్", en: "Colony Group" },
  packCopied: { te: "కాపీ అయింది — గ్రూప్‌లో పేస్ట్ చేయండి", en: "Copied — paste in your group" },
  compositing: { te: "మీ బ్యానర్‌తో వీడియో తయారవుతోంది…", en: "Adding your banner to the video…" },
  compositingNote: { te: "ఇది 30–60 సెకన్లు పట్టవచ్చు", en: "This may take 30–60 seconds" },
};

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const { api, user } = useAuth();
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [captionToast, setCaptionToast] = useState(false);
  const [packToast, setPackToast] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [igConnected, setIgConnected] = useState(false);
  const [igPublishing, setIgPublishing] = useState(false);
  const [igToast, setIgToast] = useState<string | null>(null);
  const [ytConnected, setYtConnected] = useState(false);
  const [ytPublishing, setYtPublishing] = useState(false);
  const [ytToast, setYtToast] = useState<string | null>(null);
  // True while on-device ffmpeg compositing is running
  const [compositing, setCompositing] = useState(false);

  // Hidden WorkerBanner rendered off-screen for view-shot capture
  const bannerRef = useRef<View>(null);

  const pop = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (earned !== null && earned > 0) {
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
    }
  }, [earned, pop]);

  const load = async () => {
    setError(undefined);
    setData(null);
    try {
      const [shareData, accounts] = await Promise.all([
        api<ShareResponse>("/share", {
          method: "POST",
          body: JSON.stringify({ creativeId: id }),
        }),
        api<Array<{ platform: string; connected: boolean; type: string }>>("/social/accounts").catch(() => []),
      ]);
      setData(shareData);
      setIgConnected(accounts.some((a) => a.platform === "instagram" && a.connected && a.type !== "personal"));
      setYtConnected(accounts.some((a) => a.platform === "youtube" && a.connected));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  /** Confirm share with the API and credit points (best-effort). */
  async function confirmShare(channel: ShareChannel) {
    if (!data) return;
    try {
      const res = await api<{ pointsAwarded: number }>("/share/confirm", {
        method: "POST",
        body: JSON.stringify({ shareEventId: data.shareEventId, channel }),
      });
      setEarned((prev) => (prev !== null && prev > 0 ? prev : res.pointsAwarded));
    } catch {
      /* points are best-effort */
    }
  }

  /**
   * Capture the hidden WorkerBanner as a PNG, run FFmpeg on-device to burn
   * it onto the video, and return the path to the composited MP4.
   * Only called for video creatives when user data is available.
   */
  async function getCompositedVideoPath(videoUrl: string): Promise<string> {
    const bannerPngUri = await captureRef(bannerRef, { format: "png", quality: 1 });
    return compositeVideoWithBanner(videoUrl, bannerPngUri, data!.shareEventId);
  }

  /**
   * Upload a local file to the creatives upload endpoint and return the CDN URL.
   */
  async function uploadLocalFile(localPath: string, mimeType: string): Promise<string> {
    const FileSystem = await import("expo-file-system/legacy");
    const res = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const blob = await fetch(`data:${mimeType};base64,${res}`).then((r) => r.blob());
    const fd = new FormData();
    fd.append("file", blob as unknown as Blob, `share-${data!.shareEventId}.mp4`);
    const { url } = await api<{ key: string; url: string }>("/creatives/upload", {
      method: "POST",
      body: fd,
    });
    return url;
  }

  /** Share video as MP4 file to WhatsApp directly (no link, actual file). */
  async function shareVideoToWhatsApp() {
    if (!data || sharing) return;
    setSharing(true);
    setCompositing(true);
    try {
      const videoUrl = data.personalizedUrl ?? data.mediaUrl;
      const localPath = await getCompositedVideoPath(videoUrl);
      setCompositing(false);

      const Sharing = await import("expo-sharing");
      await Sharing.shareAsync(localPath, {
        mimeType: "video/mp4",
        dialogTitle: t("common.appName"),
        UTI: "public.mpeg-4",
      });
      await confirmShare("whatsapp");
    } catch (e) {
      setCompositing(false);
      // Fallback: share the raw link if compositing fails
      if (data.deepLinks.whatsapp) {
        const { Linking } = await import("react-native");
        await Linking.openURL(data.deepLinks.whatsapp).catch(() => {});
      }
    } finally {
      setSharing(false);
    }
  }

  /** Save composited video to camera roll + open WA Status. */
  async function shareToWaStatus() {
    if (!data) return;
    if (Platform.OS !== "web" && data.type === "video") {
      setCompositing(true);
      try {
        const videoUrl = data.personalizedUrl ?? data.mediaUrl;
        const localPath = await getCompositedVideoPath(videoUrl);
        setCompositing(false);
        const MediaLibrary = await import("expo-media-library");
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          await MediaLibrary.saveToLibraryAsync(localPath);
        }
      } catch {
        setCompositing(false);
      }
    } else if (Platform.OS !== "web") {
      // Image: save poster thumbnail
      const imageUrl = data.personalizedUrl ?? data.mediaUrl;
      try {
        const MediaLibrary = await import("expo-media-library");
        const FileSystem = await import("expo-file-system/legacy");
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          const ext = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "jpg" : "png";
          const dest = `${FileSystem.cacheDirectory}wa-status-${data.shareEventId}.${ext}`;
          await FileSystem.downloadAsync(imageUrl, dest);
          await MediaLibrary.saveToLibraryAsync(dest);
        }
      } catch {
        // Non-critical
      }
    }
    try {
      const { Linking } = await import("react-native");
      await Linking.openURL("whatsapp://status");
      await confirmShare("whatsapp_status");
    } catch {
      /* WhatsApp not installed */
    }
  }

  /** Publish to Instagram: composite video first, upload, then API publish. */
  async function publishToInstagram() {
    if (!data || igPublishing) return;
    setIgPublishing(true);
    setIgToast(null);
    try {
      let mediaUrl: string | undefined;
      if (data.type === "video" && user) {
        setCompositing(true);
        const localPath = await getCompositedVideoPath(data.personalizedUrl ?? data.mediaUrl);
        setCompositing(false);
        mediaUrl = await uploadLocalFile(localPath, "video/mp4");
      }

      await Promise.all([
        api<{ published: boolean }>("/social/instagram/publish", {
          method: "POST",
          body: JSON.stringify({
            creativeId: id,
            kind: "feed",
            ...(mediaUrl ? { mediaUrl } : {}),
          }),
        }),
        api<{ published: boolean }>("/social/instagram/publish", {
          method: "POST",
          body: JSON.stringify({
            creativeId: id,
            kind: "story",
            ...(mediaUrl ? { mediaUrl } : {}),
          }),
        }),
      ]);
      await confirmShare("instagram_feed");
      setIgToast(lang === "te" ? "ఫీడ్ + స్టోరీ పోస్ట్ అయింది! ✓" : "Posted to feed + story! ✓");
    } catch (e) {
      setCompositing(false);
      setIgToast((e as Error).message ?? (lang === "te" ? "పోస్ట్ విఫలమైంది" : "Post failed"));
    } finally {
      setIgPublishing(false);
      setTimeout(() => setIgToast(null), 3000);
    }
  }

  /** Publish to YouTube: composite video first, upload, then API publish. */
  async function publishToYoutube() {
    if (!data || ytPublishing) return;
    setYtPublishing(true);
    setYtToast(null);
    try {
      let mediaUrl: string | undefined;
      if (data.type === "video" && user) {
        setCompositing(true);
        const localPath = await getCompositedVideoPath(data.personalizedUrl ?? data.mediaUrl);
        setCompositing(false);
        mediaUrl = await uploadLocalFile(localPath, "video/mp4");
      }

      await api<{ published: boolean }>("/social/youtube/publish", {
        method: "POST",
        body: JSON.stringify({
          creativeId: id,
          ...(mediaUrl ? { mediaUrl } : {}),
        }),
      });
      await confirmShare("youtube");
      setYtToast(lang === "te" ? "YouTube లో పోస్ట్ అయింది! ✓" : "Posted to YouTube! ✓");
    } catch (e) {
      setCompositing(false);
      setYtToast((e as Error).message ?? (lang === "te" ? "పోస్ట్ విఫలమైంది" : "Post failed"));
    } finally {
      setYtPublishing(false);
      setTimeout(() => setYtToast(null), 3000);
    }
  }

  const imageUrl = data ? (data.personalizedUrl ?? data.mediaUrl) : null;
  const isVideo = data?.type === "video";

  /** Share poster image (images only — videos go through shareVideoToWhatsApp). */
  async function sharePoster() {
    if (!data || !imageUrl || sharing || isVideo) return;
    setSharing(true);
    try {
      if (Platform.OS === "web") {
        const nav = globalThis.navigator as Navigator & {
          share?: (d: { files?: File[]; text?: string; title?: string }) => Promise<void>;
          canShare?: (d: { files?: File[] }) => boolean;
        };
        try {
          const res = await fetch(imageUrl);
          const blob = await res.blob();
          const file = new File([blob], "poster.png", { type: blob.type || "image/png" });
          if (typeof nav?.share === "function" && nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], text: data.caption, title: t("common.appName") });
            await confirmShare("other");
            return;
          }
        } catch {
          /* cancelled or files unsupported */
        }
        await downloadAndCopy();
      } else {
        const Sharing = await import("expo-sharing");
        const FileSystem = await import("expo-file-system/legacy");
        const ext = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "jpg" : "png";
        const dest = `${FileSystem.cacheDirectory}share-${data.shareEventId}.${ext}`;
        const { uri } = await FileSystem.downloadAsync(imageUrl, dest);
        await Clipboard.setStringAsync(data.caption);
        setCaptionToast(true);
        setTimeout(() => setCaptionToast(false), 2600);
        await Sharing.shareAsync(uri, {
          mimeType: ext === "jpg" ? "image/jpeg" : "image/png",
          dialogTitle: t("common.appName"),
        });
        await confirmShare("other");
      }
    } catch {
      await copyLink();
    } finally {
      setSharing(false);
    }
  }

  async function downloadAndCopy() {
    if (!data || !imageUrl) return;
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = "poster.png";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    await Clipboard.setStringAsync(data.caption);
    setCaptionToast(true);
    setTimeout(() => setCaptionToast(false), 2600);
    await confirmShare("copy_link");
  }

  async function copyLink() {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.caption);
    } catch {
      /* best-effort */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function copyPack(audience: "family" | "colony") {
    if (!data) return;
    const title = data.caption.split("|")[0]?.trim() ?? data.caption;
    const link = data.trackedLink;
    let text: string;
    if (audience === "family") {
      text = lang === "te"
        ? `చూడండి — ${title}\n\nమన TRS కార్యకర్తలు మీ కోసం పని చేస్తున్నారు. మీరు కూడా ఇది మీ కాంటాక్టులకు ఫార్వర్డ్ చేయండి 🙏\n${link}`
        : `Have a look — ${title}\n\nOur TRS workers are working for you. Please forward this to your contacts 🙏\n${link}`;
    } else {
      text = lang === "te"
        ? `🔔 ముఖ్యమైన సమాచారం\n\n${title}\n\nమన కాలనీ వాసులందరూ ఇది చదవండి. Kavitha గారి TRS మన హక్కుల కోసం పోరాడుతోంది.\n${link}\n#Kavitha #TelanganaRaksha #TRS`
        : `🔔 Important Update\n\n${title}\n\nAll colony residents please read. Kavitha's TRS is fighting for our rights.\n${link}\n#Kavitha #TelanganaRaksha #TRS`;
    }
    try {
      await Clipboard.setStringAsync(text);
    } catch { /* best-effort */ }
    setPackToast(true);
    setTimeout(() => setPackToast(false), 2000);
  }

  // Build BannerUser from auth context
  const bannerUser: BannerUser | null = user
    ? {
        id: user.id,
        name: user.name,
        designation: user.designation,
        photoUrl: user.photoUrl,
        tier: user.tier,
        area: user.area,
        boothName: user.boothName,
        orgUnitName: user.orgUnitName,
      }
    : null;

  if (error) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: t("share.title") }} />
        <StateView
          tone="error"
          title={L.errorTitle[lang] ?? L.errorTitle.en}
          message={error}
          retryLabel={t("common.retry")}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={st.wrap}>
        <Stack.Screen options={{ title: t("share.title") }} />
        <SkeletonBlock height={96} rounded={radius.lg} dark />
        <View style={{ height: 16 }} />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} height={50} rounded={radius.md} style={{ marginBottom: 10 }} />
        ))}
      </View>
    );
  }

  const alreadyEarned = data.basePointsAwarded > 0 && (earned === null || earned === 0);

  return (
    <View style={st.wrap}>
      <Stack.Screen options={{ title: t("share.title") }} />

      {/* Hidden WorkerBanner at 340dp — captured by view-shot for compositing */}
      {bannerUser && (
        <View
          ref={bannerRef}
          collapsable={false}
          style={st.hiddenBanner}
        >
          <WorkerBanner user={bannerUser} width={340} />
        </View>
      )}

      {/* Full-screen compositing overlay */}
      {compositing && (
        <View style={st.compositingOverlay}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={st.compositingText}>{L.compositing[lang] ?? L.compositing.en}</Text>
          <Text style={st.compositingNote}>{L.compositingNote[lang] ?? L.compositingNote.en}</Text>
        </View>
      )}

      {/* Poster / thumbnail preview */}
      {imageUrl ? (
        <View style={st.previewRow}>
          <Image source={{ uri: imageUrl }} style={st.preview} contentFit="cover" transition={150} />
          <View style={{ flex: 1 }}>
            {earned !== null && earned > 0 ? (
              <Animated.View style={[st.pointsBanner, shadow, { transform: [{ scale: pop }] }]}>
                <Feather name="star" size={24} color={colors.gold} style={{ marginBottom: 4 }} />
                <Text style={st.pointsText}>{t("share.pointsEarned", { points: earned })}</Text>
                <Text style={st.trackedNote}>{t("share.trackedNote")}</Text>
              </Animated.View>
            ) : (
              <View style={[st.pointsBanner, shadow]}>
                <Feather name="gift" size={24} color={colors.gold} style={{ marginBottom: 4 }} />
                <Text style={st.trackedNote}>
                  {alreadyEarned ? (L.alreadyEarned[lang] ?? L.alreadyEarned.en) : t("share.trackedNote")}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Primary share CTA — images only; videos use channel buttons */}
      {!isVideo && (
        <>
          <Pressable
            onPress={() => void sharePoster()}
            disabled={sharing}
            style={({ pressed }) => [st.primary, { opacity: pressed || sharing ? 0.9 : 1 }]}
          >
            <Text style={st.primaryText}>↗ {L.shareNow[lang] ?? L.shareNow.en}</Text>
          </Pressable>
          <Text style={st.hint}>
            {captionToast ? (L.captionCopied[lang] ?? L.captionCopied.en) : (L.hint[lang] ?? L.hint.en)}
          </Text>
        </>
      )}
      {isVideo && (
        <Text style={st.hint}>{L.hint[lang] ?? L.hint.en}</Text>
      )}

      <View style={st.channels}>
        {/* WhatsApp — videos share as MP4 file with banner; images use link */}
        <Channel
          label={t("share.whatsapp")}
          icon="message-circle"
          color="#25D366"
          onPress={isVideo
            ? () => void shareVideoToWhatsApp()
            : () => { void (async () => {
                const { Linking } = await import("react-native");
                await Linking.openURL(data.deepLinks.whatsapp_web ?? data.deepLinks.whatsapp ?? "").catch(() => {});
                await confirmShare("whatsapp");
              })(); }
          }
        />

        <Channel
          label="WA Status"
          icon="circle"
          color="#075e54"
          onPress={() => void shareToWaStatus()}
        />

        {igToast ? <Text style={st.igToast}>{igToast}</Text> : null}
        <Channel
          label={igPublishing ? (lang === "te" ? "పోస్ట్ అవుతోంది…" : "Posting…") : t("share.instagram")}
          icon={igPublishing ? "loader" : "instagram"}
          color="#E1306C"
          disabled={igPublishing}
          onPress={igConnected
            ? () => void publishToInstagram()
            : () => { void (async () => {
                const { Linking } = await import("react-native");
                await Linking.openURL(data.deepLinks.instagram ?? "").catch(() => {});
                await confirmShare("instagram_story");
              })(); }
          }
        />

        {ytToast ? <Text style={st.ytToast}>{ytToast}</Text> : null}
        <Channel
          label={ytPublishing ? (lang === "te" ? "పోస్ట్ అవుతోంది…" : "Posting…") : "YouTube"}
          icon={ytPublishing ? "loader" : "youtube"}
          color="#FF0000"
          disabled={ytPublishing}
          onPress={ytConnected
            ? () => void publishToYoutube()
            : () => { void (async () => {
                const { Linking } = await import("react-native");
                await Linking.openURL(data.deepLinks.youtube ?? "https://studio.youtube.com").catch(() => {});
                await confirmShare("youtube");
              })(); }
          }
        />

        {Platform.OS === "web" ? (
          <Channel
            label={L.downloadShare[lang] ?? L.downloadShare.en}
            icon="download"
            color={colors.primary}
            onPress={() => void downloadAndCopy()}
          />
        ) : null}

        <Channel
          label={copied ? (L.copied[lang] ?? L.copied.en) : t("share.copyLink")}
          icon={copied ? "check" : "link"}
          color={copied ? colors.success : "#475569"}
          onPress={() => void copyLink()}
        />
      </View>

      {/* Forward Packs */}
      <Text style={st.capLabel}>{L.forwardPacks[lang] ?? L.forwardPacks.en}</Text>
      {packToast ? <Text style={st.packToast}>{L.packCopied[lang] ?? L.packCopied.en}</Text> : null}
      <View style={st.packRow}>
        <Pressable
          style={({ pressed }) => [st.packBtn, { borderColor: "#25D366" }, pressed && { opacity: 0.8 }]}
          onPress={() => void copyPack("family")}
        >
          <Text style={st.packIcon}>👨‍👩‍👧</Text>
          <Text style={[st.packLabel, { color: "#25D366" }]}>{L.packFamily[lang] ?? L.packFamily.en}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [st.packBtn, { borderColor: colors.primary }, pressed && { opacity: 0.8 }]}
          onPress={() => void copyPack("colony")}
        >
          <Text style={st.packIcon}>🏘️</Text>
          <Text style={[st.packLabel, { color: colors.primary }]}>{L.packColony[lang] ?? L.packColony.en}</Text>
        </Pressable>
      </View>

      <Text style={[st.capLabel, { marginTop: 16 }]}>{lang === "te" ? "క్యాప్షన్" : "Caption"}</Text>
      <View style={st.captionBox}>
        <Text selectable style={st.caption}>{data.caption}</Text>
      </View>
    </View>
  );
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function Channel({
  label, color, icon, onPress, disabled,
}: {
  label: string; color: string; icon: FeatherName; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [st.channel, { borderColor: color }, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={[st.channelText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },

  // Hidden off-screen banner for view-shot capture
  hiddenBanner: { position: "absolute", top: -9999, left: 0, width: 340 },

  // Compositing overlay
  compositingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    gap: 12,
  },
  compositingText: {
    color: "#fff",
    fontSize: 16,
    fontFamily,
    fontWeight: "700",
    lineHeight: lh(16),
    textAlign: "center",
    paddingHorizontal: 24,
  },
  compositingNote: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily,
    textAlign: "center",
  },

  previewRow: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "stretch" },
  preview: {
    width: 96,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointsBanner: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  pointsText: { color: colors.gold, fontSize: 26, fontWeight: "700", fontFamily, lineHeight: lh(26) },
  trackedNote: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18, fontFamily },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 18, fontFamily, lineHeight: lh(18) },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 10, marginBottom: 18, fontFamily, lineHeight: lh(13) },
  channels: { gap: 10, marginBottom: 20 },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  channelText: { fontWeight: "700", fontSize: 16, fontFamily, lineHeight: lh(16) },
  capLabel: { fontWeight: "700", color: colors.textMuted, marginBottom: 6, fontFamily },
  captionBox: { backgroundColor: "#fff", borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  caption: { color: colors.text, lineHeight: 21, fontFamily },
  packRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  packBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  packIcon: { fontSize: 18 },
  packLabel: { fontWeight: "700", fontSize: 13, fontFamily, lineHeight: lh(13), flex: 1 },
  packToast: { color: colors.success, fontSize: 13, fontWeight: "600", fontFamily, marginBottom: 6, lineHeight: lh(13) },
  igToast: { color: "#E1306C", fontSize: 13, fontWeight: "600", fontFamily, marginBottom: 6, lineHeight: lh(13), textAlign: "center" },
  ytToast: { color: "#FF0000", fontSize: 13, fontWeight: "600", fontFamily, marginBottom: 6, lineHeight: lh(13), textAlign: "center" },
});
