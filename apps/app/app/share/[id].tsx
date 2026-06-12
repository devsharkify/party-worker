import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
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
import { useAuth } from "../../src/auth/auth-context";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";

interface ShareResponse {
  shareEventId: string;
  trackedLink: string;
  caption: string;
  basePointsAwarded: number;
  personalizedUrl: string | null;
  mediaUrl: string;
  deepLinks: Record<string, string>;
}

type ShareChannel =
  | "whatsapp_status"
  | "whatsapp"
  | "instagram_story"
  | "instagram_feed"
  | "facebook"
  | "copy_link"
  | "other";

const L = {
  errorTitle: { te: "షేర్ లింక్ సిద్ధం కాలేదు", en: "Couldn’t prepare your share" },
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
};

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const { api } = useAuth();
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [captionToast, setCaptionToast] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  // Celebratory pop on the points banner — fires only once points are earned.
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
      setData(
        await api<ShareResponse>("/share", {
          method: "POST",
          body: JSON.stringify({ creativeId: id }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  /** Tell the API a real share happened; credits the base point once. */
  async function confirmShare(channel: ShareChannel) {
    if (!data) return;
    try {
      const res = await api<{ pointsAwarded: number }>("/share/confirm", {
        method: "POST",
        body: JSON.stringify({ shareEventId: data.shareEventId, channel }),
      });
      setEarned((prev) => (prev !== null && prev > 0 ? prev : res.pointsAwarded));
    } catch {
      /* points are best-effort — never block the share UX on the confirm call */
    }
  }

  const imageUrl = data ? (data.personalizedUrl ?? data.mediaUrl) : null;

  /** Share the actual poster image (with the caption travelling alongside). */
  async function sharePoster() {
    if (!data || !imageUrl || sharing) return;
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
          /* cancelled or files unsupported — fall through to download+copy */
        }
        await downloadAndCopy();
      } else {
        const Sharing = await import("expo-sharing");
        const FileSystem = await import("expo-file-system/legacy");
        const ext = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "jpg" : "png";
        const dest = `${FileSystem.cacheDirectory}share-${data.shareEventId}.${ext}`;
        const { uri } = await FileSystem.downloadAsync(imageUrl, dest);
        // The OS sheet can't carry text with an image everywhere — pre-copy the caption.
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

  /** Web fallback: download the poster + copy the caption = a completed share. */
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

  /** Open a channel deep link, then credit the share. */
  async function openChannel(channel: ShareChannel, url?: string) {
    if (!url) return;
    try {
      await Linking.openURL(url);
      await confirmShare(channel);
    } catch {
      /* channel app missing — no points, no crash */
    }
  }

  /** Copy the caption via expo-clipboard (works web + native). No points. */
  async function copyLink() {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.caption);
    } catch {
      /* clipboard unavailable — still show confirmation so the user isn't stuck */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

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

      {/* Poster preview — this exact image is what gets shared */}
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

      {/* Primary CTA — shares the poster image itself */}
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

      <View style={st.channels}>
        <Channel
          label={t("share.whatsapp")}
          icon="message-circle"
          color="#25D366"
          onPress={() => void openChannel("whatsapp", data.deepLinks.whatsapp_web ?? data.deepLinks.whatsapp)}
        />
        <Channel
          label={t("share.instagram")}
          icon="instagram"
          color="#E1306C"
          onPress={() => void openChannel("instagram_story", data.deepLinks.instagram)}
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

      <Text style={st.capLabel}>{lang === "te" ? "క్యాప్షన్" : "Caption"}</Text>
      <View style={st.captionBox}>
        <Text selectable style={st.caption}>
          {data.caption}
        </Text>
      </View>
    </View>
  );
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function Channel({
  label,
  color,
  icon,
  onPress,
}: {
  label: string;
  color: string;
  icon: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.channel, { borderColor: color }, pressed && { opacity: 0.85 }]}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={[st.channelText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
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
  pointsText: { color: colors.gold, fontSize: 26, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(26) },
  trackedNote: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18, fontFamily: fontFamily },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 18, fontFamily: fontFamily, lineHeight: lh(18) },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 10, marginBottom: 18, fontFamily: fontFamily, lineHeight: lh(13) },
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
  channelText: { fontWeight: "700", fontSize: 16, fontFamily: fontFamily, lineHeight: lh(16) },
  capLabel: { fontWeight: "700", color: colors.textMuted, marginBottom: 6, fontFamily: fontFamily },
  captionBox: { backgroundColor: "#fff", borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  caption: { color: colors.text, lineHeight: 21, fontFamily: fontFamily },
});
