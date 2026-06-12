import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { toast } from "sonner-native";
import { LEADER_ROLES } from "@pw/shared";
import { useAuth } from "../src/auth/auth-context";
import { useApi } from "../src/hooks";
import { StateView } from "../src/components/StateView";
import { SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

interface Submission {
  id: string;
  title: string;
  type: "image" | "video";
  sourceUrl: string;
  thumbnailUrl: string | null;
  videoDurationSec: number | null;
  captionVariants: { te?: string; en?: string } | null;
  submittedByName: string;
  submittedByUnit: string | null;
  createdAt: string;
}

const L = {
  title: { te: "సమర్పణల సమీక్ష", en: "Review submissions" },
  empty: { te: "సమీక్షకు ఏమీ లేవు", en: "Nothing to review" },
  emptyHint: {
    te: "మీ ప్రాంత కార్యకర్తల సమర్పణలు ఇక్కడ కనిపిస్తాయి.",
    en: "Submissions from your area's workers appear here.",
  },
  approve: { te: "ఆమోదించండి", en: "Approve" },
  reject: { te: "తిరస్కరించండి", en: "Reject" },
  notePh: { te: "తిరస్కరణ కారణం (ఐచ్ఛికం)", en: "Reason for rejection (optional)" },
  approved: { te: "ఆమోదించబడింది — ఫీడ్‌లో ప్రచురించబడింది", en: "Approved — published to feed" },
  rejected: { te: "తిరస్కరించబడింది", en: "Rejected" },
  failed: { te: "విఫలమైంది", en: "Action failed" },
  notAllowed: { te: "ఈ స్క్రీన్ నాయకులకు మాత్రమే", en: "This screen is for leaders only" },
  by: { te: "పంపినవారు", en: "By" },
};

export default function ReviewSubmissionsScreen() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: keyof typeof L) => L[k][lang] ?? L[k].en;
  const { api, user } = useAuth();
  const isReviewer =
    !!user && (LEADER_ROLES.includes(user.role) || user.role === "hq_admin" || user.role === "state_admin");

  const subs = useApi<Submission[]>(isReviewer ? "/creatives/submissions" : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(id: string, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(id);
    try {
      await api(`/creatives/submissions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { note: notes[id]?.trim() || undefined } : {}),
      });
      toast.success(action === "approve" ? ll("approved") : ll("rejected"));
      await subs.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? ll("failed"));
    } finally {
      setBusyId(null);
    }
  }

  if (!isReviewer) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: ll("title") }} />
        <StateView tone="error" title={ll("title")} message={ll("notAllowed")} />
      </View>
    );
  }

  if (subs.error) {
    return (
      <View style={st.center}>
        <Stack.Screen options={{ title: ll("title") }} />
        <StateView tone="error" title={ll("title")} message={subs.error} onRetry={() => void subs.reload()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={st.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={subs.refreshing} onRefresh={() => void subs.refresh()} />
      }
    >
      <Stack.Screen options={{ title: ll("title") }} />

      {subs.loading ? (
        [0, 1].map((i) => (
          <SkeletonBlock key={i} height={220} rounded={radius.lg} style={{ marginBottom: 12 }} />
        ))
      ) : !subs.data || subs.data.length === 0 ? (
        <View style={st.emptyBox}>
          <Feather name="check-circle" size={30} color={colors.success} />
          <Text style={st.emptyTitle}>{ll("empty")}</Text>
          <Text style={st.emptyHint}>{ll("emptyHint")}</Text>
        </View>
      ) : (
        subs.data.map((s) => {
          const caption = s.captionVariants?.[lang] || s.captionVariants?.te || s.captionVariants?.en;
          return (
            <View key={s.id} style={[st.card, shadow]}>
              <View style={st.mediaWrap}>
                <Image
                  source={{ uri: s.thumbnailUrl ?? s.sourceUrl }}
                  style={st.media}
                  contentFit="cover"
                  transition={150}
                />
                {s.type === "video" ? (
                  <View style={st.playBadge}>
                    <Feather name="play" size={16} color="#fff" />
                    {s.videoDurationSec ? (
                      <Text style={st.durText}>{s.videoDurationSec}s</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <Text style={st.cardTitle}>{s.title}</Text>
              <Text style={st.meta}>
                {ll("by")}: {s.submittedByName}
                {s.submittedByUnit ? ` · ${s.submittedByUnit}` : ""}
              </Text>
              {caption ? (
                <Text style={st.caption} numberOfLines={3}>
                  {caption}
                </Text>
              ) : null}

              <TextInput
                value={notes[s.id] ?? ""}
                onChangeText={(v) => setNotes((p) => ({ ...p, [s.id]: v }))}
                placeholder={ll("notePh")}
                placeholderTextColor="#94a3b8"
                style={st.noteInput}
              />

              <View style={st.actions}>
                <Pressable
                  onPress={() => void act(s.id, "reject")}
                  disabled={busyId === s.id}
                  style={({ pressed }) => [st.rejectBtn, (pressed || busyId === s.id) && { opacity: 0.8 }]}
                >
                  <Feather name="x" size={15} color="#991B1B" />
                  <Text style={st.rejectText}>{ll("reject")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void act(s.id, "approve")}
                  disabled={busyId === s.id}
                  style={({ pressed }) => [st.approveBtn, (pressed || busyId === s.id) && { opacity: 0.85 }]}
                >
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={st.approveText}>{ll("approve")}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { fontWeight: "700", fontSize: 16, color: colors.text, fontFamily, lineHeight: lh(16) },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 24, fontFamily },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: 12, marginBottom: 14 },
  mediaWrap: { borderRadius: radius.md, overflow: "hidden", marginBottom: 10 },
  media: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bg },
  playBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durText: { color: "#fff", fontSize: 11, fontWeight: "700", fontFamily },
  cardTitle: { fontWeight: "700", fontSize: 15, color: colors.text, fontFamily, lineHeight: lh(15) },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily },
  caption: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 19, fontFamily },
  noteInput: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    marginTop: 10,
    fontFamily,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: "#FCA5A5",
    borderRadius: radius.md,
    height: 44,
    backgroundColor: "#FEF2F2",
  },
  rejectText: { color: "#991B1B", fontWeight: "700", fontSize: 14, fontFamily, lineHeight: lh(14) },
  approveBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    height: 44,
  },
  approveText: { color: "#fff", fontWeight: "700", fontSize: 14, fontFamily, lineHeight: lh(14) },
});
