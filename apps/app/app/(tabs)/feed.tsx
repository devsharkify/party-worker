import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { FeedItem } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { Pill } from "../../src/components/ui";
import { FeedCardSkeleton } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colors, radius, shadow } from "../../src/theme";
import { useIsOnline } from "../../src/lib/offline";

const L = {
  refresh: { te: "లాగి రిఫ్రెష్ చేయండి", en: "Pull to refresh" },
  errorTitle: { te: "ఫీడ్ లోడ్ కాలేదు", en: "Couldn’t load the feed" },
  emptyTitle: { te: "ఇంకా కంటెంట్ లేదు", en: "Nothing here yet" },
};

export default function Feed() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";
  const router = useRouter();
  const { data, loading, refreshing, error, reload, refresh } = useApi<FeedItem[]>("/feed");
  const isOnline = useIsOnline();

  // Initial load → skeleton list.
  if (loading && !data) {
    return (
      <View style={st.skeletonWrap}>
        {[0, 1, 2].map((i) => (
          <FeedCardSkeleton key={i} />
        ))}
      </View>
    );
  }

  // Hard error with no cached data → full error state + retry.
  if (error && !data) {
    return (
      <View style={st.fill}>
        <StateView
          glyph="⚠️"
          tone="error"
          title={L.errorTitle[lang] ?? L.errorTitle.en}
          message={error}
          retryLabel={t("common.retry")}
          onRetry={reload}
        />
      </View>
    );
  }

  return (
    <View style={st.fill}>
      {!isOnline && (
        <View style={st.offlineBanner}>
          <Text style={st.offlineBannerText}>
            📡 ఆఫ్‌లైన్ — Cached content
          </Text>
        </View>
      )}
      <FlatList
        style={st.list}
        contentContainerStyle={st.content}
        data={data ?? []}
        keyExtractor={(i) => i.creativeId}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <StateView
            glyph="📣"
            title={L.emptyTitle[lang] ?? L.emptyTitle.en}
            message={t("feed.empty")}
          />
        }
        renderItem={({ item }) => {
          const caption =
            item.captionVariants[lang] ?? item.captionVariants.te ?? "";
          return (
            <Pressable
              style={({ pressed }) => [st.card, pressed && st.cardPressed]}
              onPress={() => router.push(`/personalize/${item.creativeId}`)}
            >
              <View style={st.imageWrap}>
                <RemoteImage
                  uri={item.personalizedUrl ?? item.thumbnailUrl ?? item.sourceUrl}
                  width="100%"
                  height={200}
                />
                <View style={st.badges}>
                  {item.isNew ? <Pill label={t("feed.new")} color={colors.green} /> : null}
                  {item.personalizedUrl ? (
                    <Pill label={t("feed.personalizedBadge")} color={colors.primary} />
                  ) : null}
                  {item.aiLabeled ? <Pill label="AI" color="#475569" /> : null}
                </View>
              </View>
              <View style={st.body}>
                <Text style={st.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={st.caption} numberOfLines={2}>
                  {caption}
                </Text>
                <View style={st.cta}>
                  <Text style={st.ctaText}>{t("feed.openToPersonalize")}</Text>
                  <Text style={st.ctaArrow}>→</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  list: { flex: 1 },
  content: { padding: 14, paddingBottom: 32 },
  skeletonWrap: { flex: 1, backgroundColor: colors.cardMuted, padding: 14 },
  offlineBanner: {
    backgroundColor: "#fef08a",
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#713f12",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  imageWrap: { position: "relative" },
  body: { padding: 14 },
  badges: { position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  caption: { fontSize: 14, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  cta: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  ctaText: { color: colors.primaryDark, fontWeight: "800" },
  ctaArrow: { color: colors.primaryDark, fontWeight: "800", fontSize: 16 },
});
