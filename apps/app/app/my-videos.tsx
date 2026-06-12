import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useApi } from "../src/hooks";
import { StateView } from "../src/components/StateView";
import { SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../src/theme";

interface MyRender {
  id: string;
  creativeId: string;
  title: string;
  type: "image" | "video";
  sourceUrl: string;
  thumbnailUrl: string;
  cachedUrl: string | null;
  cachedVideoUrl: string | null;
  createdAt: string;
}

function timeAgo(iso: string, lang: "te" | "en") {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return lang === "te" ? `${d} రోజుల క్రితం` : `${d}d ago`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return lang === "te" ? `${h} గం. క్రితం` : `${h}h ago`;
  return lang === "te" ? "ఇప్పుడే" : "Just now";
}

const L = {
  title: { te: "నా వీడియోలు", en: "My Videos" },
  personalised: { te: "వ్యక్తిగతీకరించబడింది", en: "Personalised" },
  download: { te: "డౌన్‌లోడ్", en: "Download" },
  share: { te: "షేర్", en: "Share" },
  loadFail: { te: "మీ వీడియోలు లోడ్ కాలేదు", en: "Couldn\u2019t load your videos" },
  retry: { te: "మళ్లీ ప్రయత్నించండి", en: "Retry" },
  emptyTitle: { te: "ఇంకా వ్యక్తిగత కంటెంట్ లేదు", en: "No personalised content yet" },
  emptyMsg: {
    te: "ఫీడ్‌లో ఏదైనా పోస్టర్ నొక్కి వ్యక్తిగతీకరించండి — అది ఇక్కడ కనిపిస్తుంది.",
    en: "Tap any creative in your feed and personalise it — it will appear here.",
  },
};

function downloadUrl(url: string, filename: string) {
  if (Platform.OS !== "web") return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function RenderCard({ item, onShare, lang }: { item: MyRender; onShare: () => void; lang: "te" | "en" }) {
  const thumb = item.cachedUrl ?? item.thumbnailUrl ?? item.sourceUrl;
  const hasPersonalized = !!(item.cachedUrl || item.cachedVideoUrl);
  const downloadSrc = item.cachedVideoUrl ?? item.cachedUrl ?? item.sourceUrl;
  const ext = item.type === "video" ? "mp4" : "jpg";

  return (
    <View style={st.card}>
      <View style={st.thumbWrap}>
        <Image
          source={{ uri: thumb }}
          style={st.thumb}
          contentFit="cover"
          transition={200}
        />
        {item.type === "video" && (
          <View style={st.playBadge}>
            <Feather name="play" size={14} color="#fff" />
          </View>
        )}
        {hasPersonalized && (
          <View style={st.personalizedBadge}>
            <Feather name="user-check" size={10} color="#fff" />
            <Text style={st.personalizedBadgeText}>{L.personalised[lang]}</Text>
          </View>
        )}
      </View>

      <View style={st.info}>
        <Text style={st.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={st.cardTime}>{timeAgo(item.createdAt, lang)}</Text>

        <View style={st.actions}>
          <Pressable
            onPress={() => downloadUrl(downloadSrc, `mytrs-${item.creativeId}.${ext}`)}
            style={({ pressed }) => [st.actionBtn, st.downloadBtn, pressed && { opacity: 0.75 }]}
          >
            <Feather name="download" size={14} color="#fff" />
            <Text style={st.actionBtnText}>{L.download[lang]}</Text>
          </Pressable>
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [st.actionBtn, st.shareBtn, pressed && { opacity: 0.75 }]}
          >
            <Feather name="share-2" size={14} color={colors.primary} />
            <Text style={[st.actionBtnText, { color: colors.primary }]}>{L.share[lang]}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function MyVideos() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const { data, loading, refreshing, error, reload, refresh } = useApi<MyRender[]>("/feed/renders/mine");

  const items = data ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: L.title[lang],
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: fontWeight.bold, fontFamily: fontFamily, fontSize: 17 },
        }}
      />
      <View style={st.fill}>
        {loading && !data ? (
          <ScrollView contentContainerStyle={st.content}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[st.card, { flexDirection: "column" }]}>
                <SkeletonBlock width="100%" height={160} rounded={radius.md} />
                <SkeletonBlock width="70%" height={14} style={{ marginTop: 10 }} />
                <SkeletonBlock width="40%" height={12} style={{ marginTop: 6 }} />
              </View>
            ))}
          </ScrollView>
        ) : error && !data ? (
          <StateView
            tone="error"
            title={L.loadFail[lang]}
            message={error}
            retryLabel={L.retry[lang]}
            onRetry={reload}
          />
        ) : items.length === 0 ? (
          <StateView title={L.emptyTitle[lang]} message={L.emptyMsg[lang]} />
        ) : (
          <ScrollView
            contentContainerStyle={st.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
            }
          >
            <Text style={st.heading}>{lang === "te" ? `${items.length} వ్యక్తిగత ఐటెమ్‌లు` : `${items.length} personalised ${items.length === 1 ? "item" : "items"}`}</Text>
            {items.map((item) => (
              <RenderCard
                key={item.id}
                item={item}
                lang={lang}
                onShare={() => router.push(`/share/${item.creativeId}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  content: { padding: 14, paddingBottom: 40, gap: 14 },
  heading: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
    fontFamily: fontFamily,
    lineHeight: lh(13),
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  thumbWrap: {
    width: 120,
    height: 120,
    flexShrink: 0,
    position: "relative",
  },
  thumb: { width: 120, height: 120 },
  playBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 5,
  },
  personalizedBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  personalizedBadgeText: { color: "#fff", fontSize: 9, fontWeight: fontWeight.bold, fontFamily: fontFamily, lineHeight: lh(9) },
  info: { flex: 1, padding: 12, justifyContent: "space-between" },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: fontWeight.semibold, lineHeight: 20, fontFamily: fontFamily },
  cardTime: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontFamily: fontFamily, lineHeight: lh(12) },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  downloadBtn: { backgroundColor: colors.primary },
  shareBtn: { borderWidth: 1.5, borderColor: colors.primary },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: fontWeight.semibold, fontFamily: fontFamily, lineHeight: lh(12) },
});
