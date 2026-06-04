import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { FeedItem } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { Pill } from "../../src/components/ui";
import { colors, radius } from "../../src/theme";

export default function Feed() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, loading } = useApi<FeedItem[]>("/feed");

  if (loading && !data) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.cardMuted }}
      contentContainerStyle={{ padding: 14 }}
      data={data ?? []}
      keyExtractor={(i) => i.creativeId}
      ListEmptyComponent={<Text style={st.empty}>{t("feed.empty")}</Text>}
      renderItem={({ item }) => {
        const caption =
          item.captionVariants[i18n.language as "te" | "en"] ?? item.captionVariants.te ?? "";
        return (
          <Pressable style={st.card} onPress={() => router.push(`/personalize/${item.creativeId}`)}>
            <Image
              source={{ uri: item.personalizedUrl ?? item.thumbnailUrl ?? item.sourceUrl }}
              style={st.image}
              resizeMode="cover"
            />
            <View style={st.body}>
              <View style={st.badges}>
                {item.isNew ? <Pill label={t("feed.new")} color={colors.green} /> : null}
                {item.personalizedUrl ? (
                  <Pill label={t("feed.personalizedBadge")} color={colors.primary} />
                ) : null}
                {item.aiLabeled ? <Pill label="AI" color={colors.textMuted} /> : null}
              </View>
              <Text style={st.title}>{item.title}</Text>
              <Text style={st.caption} numberOfLines={2}>
                {caption}
              </Text>
              <View style={st.cta}>
                <Text style={st.ctaText}>{t("feed.openToPersonalize")} →</Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: "100%", height: 200, backgroundColor: colors.bgElevated },
  body: { padding: 14 },
  badges: { flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  caption: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  cta: { marginTop: 12 },
  ctaText: { color: colors.primaryDark, fontWeight: "700" },
});
