import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
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
  deepLinks: Record<string, string>;
}

const L = {
  errorTitle: { te: "షేర్ లింక్ సిద్ధం కాలేదు", en: "Couldn’t prepare your share" },
  copied: { te: "కాపీ అయింది!", en: "Copied!" },
  shareNow: { te: "ఇప్పుడే షేర్ చేయండి", en: "Share now" },
  hint: { te: "మీ ఎంపికను తెరవడానికి నొక్కండి", en: "Tap to open your channel" },
};

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const { api } = useAuth();
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  // Celebratory pop on the points banner.
  const pop = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (data) {
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
    }
  }, [data, pop]);

  const load = async () => {
    setError(undefined);
    setData(null);
    try {
      setData(
        await api<ShareResponse>("/share", {
          method: "POST",
          body: JSON.stringify({ creativeId: id, channel: "whatsapp_status" }),
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

  /** Reliably open the OS share sheet. */
  async function openSheet() {
    if (!data) return;
    const message = data.caption;
    if (Platform.OS === "web") {
      const nav = globalThis.navigator as Navigator & {
        share?: (d: { text?: string; title?: string }) => Promise<void>;
      };
      if (typeof nav?.share === "function") {
        try {
          await nav.share({ text: message, title: t("common.appName") });
          return;
        } catch {
          /* user cancelled or unsupported → fall through to copy */
        }
      }
      await copyLink();
    } else {
      try {
        await Share.share({ message });
      } catch {
        await copyLink();
      }
    }
  }

  /** Copy the caption via expo-clipboard (works web + native). */
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

  const openLink = (url?: string) => {
    if (url) void Linking.openURL(url);
  };

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

  return (
    <View style={st.wrap}>
      <Stack.Screen options={{ title: t("share.title") }} />

      {/* Celebratory points banner */}
      <Animated.View style={[st.pointsBanner, shadow, { transform: [{ scale: pop }] }]}>
        <Feather name="star" size={28} color={colors.gold} style={{ marginBottom: 4 }} />
        <Text style={st.pointsText}>{t("share.pointsEarned", { points: data.basePointsAwarded })}</Text>
        <Text style={st.trackedNote}>{t("share.trackedNote")}</Text>
      </Animated.View>

      {/* Primary CTA — always opens the OS share sheet */}
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => [st.primary, { opacity: pressed ? 0.9 : 1 }]}
      >
        <Text style={st.primaryText}>↗ {L.shareNow[lang] ?? L.shareNow.en}</Text>
      </Pressable>
      <Text style={st.hint}>{L.hint[lang] ?? L.hint.en}</Text>

      <View style={st.channels}>
        <Channel
          label={t("share.whatsapp")}
          icon="message-circle"
          color="#25D366"
          onPress={() => openLink(data.deepLinks.whatsapp_web ?? data.deepLinks.whatsapp)}
        />
        <Channel
          label={t("share.instagram")}
          icon="instagram"
          color="#E1306C"
          onPress={() => openLink(data.deepLinks.instagram)}
        />
        <Channel
          label={copied ? (L.copied[lang] ?? L.copied.en) : t("share.copyLink")}
          icon={copied ? "check" : "link"}
          color={copied ? colors.success : "#475569"}
          onPress={copyLink}
        />
      </View>

      <Text style={st.capLabel}>Caption</Text>
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
  pointsBanner: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  pointsText: { color: colors.gold, fontSize: 30, fontWeight: "800", fontFamily: fontFamily, lineHeight: lh(30) },
  trackedNote: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18, fontFamily: fontFamily },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 18, fontFamily: fontFamily, lineHeight: lh(18) },
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
  channelText: { fontWeight: "800", fontSize: 16, fontFamily: fontFamily, lineHeight: lh(16) },
  capLabel: { fontWeight: "700", color: colors.textMuted, marginBottom: 6, fontFamily: fontFamily },
  captionBox: { backgroundColor: "#fff", borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  caption: { color: colors.text, lineHeight: 21, fontFamily: fontFamily },
});
