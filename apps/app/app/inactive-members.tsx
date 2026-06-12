import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { useApi } from "../src/hooks";
import { StateView } from "../src/components/StateView";
import { SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

interface InactiveMember {
  userId: string;
  name: string;
  phone: string;
  designation: string | null;
  unitName: string;
  daysIdle: number;
  lastActiveAt: string | null;
}

const L = {
  title: { te: "నిష్క్రియ సభ్యులు", en: "Inactive members" },
  intro: {
    te: "7+ రోజులుగా యాప్ వాడని సభ్యులు. ఒక్క కాల్‌తో తిరిగి తీసుకురండి.",
    en: "Members idle for 7+ days. One call brings them back.",
  },
  empty: { te: "అందరూ యాక్టివ్‌గా ఉన్నారు! 🎉", en: "Everyone is active! 🎉" },
  daysIdle: { te: "రోజులుగా నిష్క్రియం", en: "days idle" },
  never: { te: "ఎప్పుడూ వాడలేదు", en: "never used the app" },
};

function waLink(phone: string): string {
  // wa.me wants digits only with country code; numbers are stored as +91XXXXXXXXXX.
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

export default function InactiveMembersScreen() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: keyof typeof L) => L[k][lang] ?? L[k].en;
  const members = useApi<InactiveMember[]>("/team/inactive?days=7");

  if (members.error) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: ll("title") }} />
        <StateView tone="error" title={ll("title")} message={members.error} onRetry={() => void members.reload()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={st.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={members.refreshing} onRefresh={() => void members.refresh()} />
      }
    >
      <Stack.Screen options={{ title: ll("title") }} />
      <Text style={st.intro}>{ll("intro")}</Text>

      {members.loading ? (
        [0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} height={72} rounded={radius.lg} style={{ marginBottom: 10 }} />
        ))
      ) : !members.data || members.data.length === 0 ? (
        <View style={st.emptyBox}>
          <Feather name="check-circle" size={30} color={colors.success} />
          <Text style={st.emptyTitle}>{ll("empty")}</Text>
        </View>
      ) : (
        members.data.map((m) => (
          <View key={m.userId} style={[st.card, shadow]}>
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{m.name}</Text>
              <Text style={st.meta} numberOfLines={1}>
                {m.designation ? `${m.designation} · ` : ""}{m.unitName}
              </Text>
              <Text style={st.idle}>
                {m.lastActiveAt === null
                  ? `⚠️ ${ll("never")}`
                  : `${m.daysIdle} ${ll("daysIdle")}`}
              </Text>
            </View>
            <Pressable
              onPress={() => void Linking.openURL(`tel:${m.phone}`)}
              style={({ pressed }) => [st.callBtn, pressed && { opacity: 0.8 }]}
              hitSlop={6}
            >
              <Feather name="phone" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(waLink(m.phone))}
              style={({ pressed }) => [st.waBtn, pressed && { opacity: 0.8 }]}
              hitSlop={6}
            >
              <Feather name="message-circle" size={18} color="#fff" />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14, fontFamily },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { fontWeight: "700", fontSize: 16, color: colors.text, fontFamily, lineHeight: lh(16) },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 10,
  },
  name: { fontWeight: "700", color: colors.text, fontSize: 15, fontFamily, lineHeight: lh(15) },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 1, fontFamily },
  idle: { color: "#DC2626", fontSize: 12, fontWeight: "700", marginTop: 3, fontFamily },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  waBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
});
