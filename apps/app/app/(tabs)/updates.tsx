import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useApi } from "../../src/hooks";
import { Card, Pill } from "../../src/components/ui";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { colors, radius } from "../../src/theme";

type Lang = "te" | "en";

type Announcement = {
  id: string;
  title: string;
  body: string;
  targetOrgUnitId: string | null;
  createdAt: string;
};

type ActivityEntry = {
  id: string;
  reason: string;
  points: number;
  weeklyDelta: number;
  lifetimeDelta: number;
  createdAt: string;
  label: { te: string; en: string };
};

const L = {
  title: { te: "నా అప్‌డేట్లు", en: "Updates" },
  segAnnouncements: { te: "ప్రకటనలు", en: "Announcements" },
  segActivity: { te: "నా కార్యకలాపం", en: "My Activity" },
  annEmpty: { te: "ప్రకటనలు లేవు", en: "No announcements yet" },
  annError: { te: "ప్రకటనలు లోడ్ కాలేదు", en: "Couldn’t load announcements" },
  actEmpty: { te: "ఇంకా కార్యకలాపం లేదు", en: "No activity yet" },
  actError: { te: "కార్యకలాపం లోడ్ కాలేదు", en: "Couldn’t load your activity" },
} as const;

const tx = (m: { te: string; en: string }, lang: Lang) => m[lang] ?? m.en;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function Updates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const [segment, setSegment] = useState<"announcements" | "activity">("announcements");

  // Both data sources are subscribed so each segment shows fresh data on focus;
  // pull-to-refresh only drives the segment currently on screen.
  const announcements = useApi<Announcement[]>("/announcements");
  const activity = useApi<ActivityEntry[]>("/me/activity");

  const active = segment === "announcements" ? announcements : activity;

  return (
    <ScrollView
      style={st.fill}
      contentContainerStyle={st.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={active.refreshing}
          onRefresh={active.refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={st.screenTitle}>
        {tx(L.title, lang)} / {L.title.en}
      </Text>

      <View style={st.segWrap}>
        <Segment
          label={`${tx(L.segAnnouncements, lang)} / ${L.segAnnouncements.en}`}
          active={segment === "announcements"}
          onPress={() => setSegment("announcements")}
        />
        <Segment
          label={`${tx(L.segActivity, lang)} / ${L.segActivity.en}`}
          active={segment === "activity"}
          onPress={() => setSegment("activity")}
        />
      </View>

      {segment === "announcements" ? (
        <AnnouncementsList
          state={announcements}
          lang={lang}
          retryLabel={t("common.retry")}
        />
      ) : (
        <ActivityList state={activity} lang={lang} retryLabel={t("common.retry")} />
      )}
    </ScrollView>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[st.seg, active && st.segActive]}>
      <Text style={[st.segText, active && st.segTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function AnnouncementsList({
  state,
  lang,
  retryLabel,
}: {
  state: ReturnType<typeof useApi<Announcement[]>>;
  lang: Lang;
  retryLabel: string;
}) {
  if (state.loading && !state.data) return <CardSkeletons />;
  if (state.error && !state.data) {
    return (
      <StateView
        glyph="⚠️"
        tone="error"
        title={tx(L.annError, lang)}
        message={state.error}
        retryLabel={retryLabel}
        onRetry={state.reload}
      />
    );
  }
  if ((state.data ?? []).length === 0) {
    return <StateView glyph="📣" title={tx(L.annEmpty, lang)} />;
  }
  return (
    <View>
      {(state.data ?? []).map((a) => (
        <Card key={a.id}>
          <Text style={st.annTitle}>{a.title}</Text>
          {a.body ? <Text style={st.annBody}>{a.body}</Text> : null}
          <Text style={st.date}>{fmtDate(a.createdAt)}</Text>
        </Card>
      ))}
    </View>
  );
}

function ActivityList({
  state,
  lang,
  retryLabel,
}: {
  state: ReturnType<typeof useApi<ActivityEntry[]>>;
  lang: Lang;
  retryLabel: string;
}) {
  if (state.loading && !state.data) return <RowSkeletons />;
  if (state.error && !state.data) {
    return (
      <StateView
        glyph="⚠️"
        tone="error"
        title={tx(L.actError, lang)}
        message={state.error}
        retryLabel={retryLabel}
        onRetry={state.reload}
      />
    );
  }
  if ((state.data ?? []).length === 0) {
    return <StateView glyph="✨" title={tx(L.actEmpty, lang)} />;
  }
  return (
    <View>
      {(state.data ?? []).map((row) => {
        const positive = row.points > 0;
        const color = positive ? colors.success : colors.danger;
        const sign = positive ? "+" : "";
        return (
          <Card key={row.id} style={st.actCard}>
            <View style={st.actMain}>
              <Text style={st.actLabel} numberOfLines={2}>
                {tx(row.label, lang)}
              </Text>
              <Text style={st.date}>{fmtDate(row.createdAt)}</Text>
            </View>
            <Pill label={`${sign}${row.points}`} color={color} />
          </Card>
        );
      })}
    </View>
  );
}

function CardSkeletons() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={st.skelCard}>
          <SkeletonBlock width="60%" height={18} />
          <SkeletonBlock width="95%" height={13} style={{ marginTop: 10 }} />
          <SkeletonBlock width="80%" height={13} style={{ marginTop: 6 }} />
          <SkeletonBlock width={90} height={11} style={{ marginTop: 12 }} />
        </View>
      ))}
    </View>
  );
}

function RowSkeletons() {
  return (
    <View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[st.skelCard, st.skelRow]}>
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="70%" height={15} />
            <SkeletonBlock width={70} height={11} style={{ marginTop: 8 }} />
          </View>
          <SkeletonBlock width={48} height={22} rounded={radius.pill} />
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  content: { padding: 16, paddingBottom: 48 },
  screenTitle: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 14 },

  segWrap: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 16,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  segActive: { backgroundColor: colors.primary },
  segText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
  segTextActive: { color: "#fff" },

  annTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  annBody: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 10 },

  actCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actMain: { flex: 1 },
  actLabel: { fontSize: 15, fontWeight: "700", color: colors.text },

  skelCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skelRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
