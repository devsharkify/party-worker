import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { MissionView } from "@pw/shared";
import { useAuth } from "../auth/auth-context";
import { colors, fontFamily, lh, radius } from "../theme";

function useCountdown(endsAt: string): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function tick() {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("Ended");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h > 0) setLabel(`${h}h ${m}m`);
      else if (m > 0) setLabel(`${m}m ${s}s`);
      else setLabel(`${s}s`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

function MissionCard({ mission, onComplete }: { mission: MissionView; onComplete: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const countdown = useCountdown(mission.endsAt);

  return (
    <View style={st.card}>
      <View style={st.header}>
        <Text style={st.badge}>🎯 {t("missions.trendAlert")}</Text>
        <View style={[st.timerBadge, countdown === "Ended" && st.timerEnded]}>
          <Text style={st.timerText}>{countdown}</Text>
        </View>
      </View>
      <Text style={st.title}>{mission.title}</Text>
      {mission.caption ? <Text style={st.caption}>{mission.caption}</Text> : null}
      {mission.hashtag ? <Text style={st.hashtag}>{mission.hashtag}</Text> : null}
      <View style={st.footer}>
        <View style={st.bonus}>
          <Text style={st.bonusText}>+{mission.bonusPoints} {t("missions.bonus")}</Text>
        </View>
        {mission.completedByViewer ? (
          <Text style={st.done}>{t("missions.done")}</Text>
        ) : countdown !== "Ended" ? (
          <Pressable
            style={st.cta}
            onPress={() => {
              onComplete();
              if (mission.creativeId) {
                router.push(`/personalize/${mission.creativeId}` as any);
              }
            }}
          >
            <Text style={st.ctaText}>{t("missions.shareNow")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function MissionBanner({
  missions,
  onComplete,
}: {
  missions: MissionView[];
  onComplete: (missionId: string) => void;
}) {
  const active = missions.filter((m) => !m.completedByViewer && new Date(m.endsAt) > new Date());
  if (active.length === 0) return null;
  return (
    <View style={st.wrap}>
      {active.slice(0, 2).map((m) => (
        <MissionCard key={m.id} mission={m} onComplete={() => onComplete(m.id)} />
      ))}
    </View>
  );
}

const ORANGE = "#F97316";
const st = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: ORANGE + "66",
    padding: 14,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: {
    fontSize: 11,
    fontWeight: "900",
    color: ORANGE,
    fontFamily: fontFamily,
    letterSpacing: 0.5,
  },
  timerBadge: {
    backgroundColor: ORANGE + "22",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timerEnded: { backgroundColor: colors.textMuted + "22" },
  timerText: { fontSize: 12, fontWeight: "700", color: ORANGE, fontFamily: fontFamily, lineHeight: lh(12) },
  title: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(15), marginBottom: 4 },
  caption: { fontSize: 13, color: colors.textMuted, fontFamily: fontFamily, lineHeight: lh(13), marginBottom: 4 },
  hashtag: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily: fontFamily, lineHeight: lh(13), marginBottom: 8 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  bonus: {
    backgroundColor: colors.success + "22",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bonusText: { fontSize: 12, fontWeight: "900", color: colors.success, fontFamily: fontFamily, lineHeight: lh(12) },
  done: { fontSize: 13, fontWeight: "700", color: colors.success, fontFamily: fontFamily, lineHeight: lh(13) },
  cta: {
    backgroundColor: ORANGE,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ctaText: { fontSize: 13, fontWeight: "900", color: "#fff", fontFamily: fontFamily, lineHeight: lh(13) },
});
