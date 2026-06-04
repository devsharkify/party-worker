import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "../../src/auth/auth-context";
import { colors, radius } from "../../src/theme";

interface ShareResponse {
  shareEventId: string;
  trackedLink: string;
  caption: string;
  basePointsAwarded: number;
  deepLinks: Record<string, string>;
}

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { api } = useAuth();
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
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
    })();
  }, [api, id]);

  async function openSheet() {
    if (!data) return;
    if (Platform.OS === "web") {
      const nav = globalThis.navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
      if (nav?.share) await nav.share({ text: data.caption });
      else await copyLink();
    } else {
      await Share.share({ message: data.caption });
    }
  }

  async function copyLink() {
    if (!data) return;
    try {
      if (Platform.OS === "web") {
        await (globalThis.navigator as Navigator).clipboard.writeText(data.caption);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const openLink = (url?: string) => url && Linking.openURL(url);

  if (error) {
    return (
      <View style={st.center}>
        <Text style={st.error}>{error}</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <Stack.Screen options={{ title: t("share.title") }} />

      <View style={st.pointsBanner}>
        <Text style={st.pointsText}>
          {t("share.pointsEarned", { points: data.basePointsAwarded })}
        </Text>
        <Text style={st.trackedNote}>{t("share.trackedNote")}</Text>
      </View>

      <View style={st.channels}>
        <Channel label={t("share.whatsappStatus")} color="#25D366" onPress={openSheet} />
        <Channel
          label={t("share.whatsapp")}
          color="#25D366"
          onPress={() => openLink(data.deepLinks.whatsapp_web ?? data.deepLinks.whatsapp)}
        />
        <Channel
          label={t("share.instagram")}
          color="#E1306C"
          onPress={() => openLink(data.deepLinks.instagram)}
        />
        <Channel
          label={copied ? t("share.shared") : t("share.copyLink")}
          color={colors.textMuted}
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

function Channel({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.channel, { borderColor: color }]}>
      <Text style={[st.channelText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  error: { color: colors.danger, fontWeight: "600", textAlign: "center", padding: 24 },
  pointsBanner: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  pointsText: { color: colors.gold, fontSize: 26, fontWeight: "800" },
  trackedNote: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 6, textAlign: "center" },
  channels: { gap: 10, marginBottom: 20 },
  channel: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  channelText: { fontWeight: "800", fontSize: 16 },
  capLabel: { fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  captionBox: { backgroundColor: "#fff", borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  caption: { color: colors.text, lineHeight: 21 },
});
