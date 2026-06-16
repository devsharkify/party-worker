import { useState, useCallback } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LEADER_ROLES } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { Card, Pill } from "../../src/components/ui";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { colors, fontFamily, lh, radius } from "../../src/theme";

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

type BoothTask = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  done: boolean;
  assignedTo: { name: string } | null;
};

const L = {
  title: { te: "నా అప్‌డేట్లు", en: "Updates" },
  segAnnouncements: { te: "ప్రకటనలు", en: "Announcements" },
  segActivity: { te: "నా కార్యకలాపం", en: "My Activity" },
  segTasks: { te: "టాస్క్‌లు", en: "Tasks" },
  annEmpty: { te: "ప్రకటనలు లేవు", en: "No announcements yet" },
  annError: { te: "ప్రకటనలు లోడ్ కాలేదు", en: "Couldn’t load announcements" },
  actEmpty: { te: "ఇంకా కార్యకలాపం లేదు", en: "No activity yet" },
  actError: { te: "కార్యకలాపం లోడ్ కాలేదు", en: "Couldn’t load your activity" },
  taskEmpty: { te: "ఇంకా టాస్క్‌లు లేవు", en: "No tasks assigned yet" },
} as const;

const tx = (m: { te: string; en: string }, lang: Lang) => m[lang] ?? m.en;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function Updates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const { user } = useAuth();
  const router = useRouter();
  const isLeader = user ? LEADER_ROLES.includes(user.role as any) : false;
  const [segment, setSegment] = useState<"announcements" | "activity" | "tasks">("announcements");

  const announcements = useApi<Announcement[]>("/announcements");
  const activity = useApi<ActivityEntry[]>("/me/activity");
  const tasks = useApi<BoothTask[]>(user ? `/booth-tasks/mine?orgUnitId=${user.orgUnitId}` : null);
  const waGroup = useApi<{ link: string; label: string | null } | null>(user ? `/wa-groups/${user.orgUnitId}` : null);

  const active = segment === "announcements" ? announcements : segment === "activity" ? activity : tasks;

  return (
    <View style={st.fill}>
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

        {/* WA Group join button */}
        {waGroup.data && (
          <Pressable
            onPress={() => Linking.openURL(waGroup.data!.link).catch(() => undefined)}
            style={({ pressed }) => [st.waBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={st.waIcon}>💬</Text>
            <Text style={st.waBtnText}>
              {waGroup.data.label ?? (lang === "te" ? "WhatsApp గ్రూప్‌లో చేరండి" : "Join WhatsApp Group")}
            </Text>
          </Pressable>
        )}

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
          <Segment
            label={`${tx(L.segTasks, lang)} / ${L.segTasks.en}`}
            active={segment === "tasks"}
            onPress={() => setSegment("tasks")}
          />
        </View>

        {segment === "announcements" ? (
          <AnnouncementsList
            state={announcements}
            lang={lang}
            retryLabel={t("common.retry")}
          />
        ) : segment === "activity" ? (
          <ActivityList state={activity} lang={lang} retryLabel={t("common.retry")} />
        ) : (
          <TasksList state={tasks} lang={lang} retryLabel={t("common.retry")} onReload={tasks.reload} />
        )}
      </ScrollView>

      {isLeader && segment === "announcements" ? (
        <Pressable
          style={st.fab}
          onPress={() => router.push("/compose-announcement" as any)}
        >
          <Feather name="edit-2" size={22} color="#fff" />
        </Pressable>
      ) : null}
    </View>
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
    <Pressable onPress={onPress} style={({ pressed }) => [st.seg, active && st.segActive, pressed && { opacity: 0.75 }]}>
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
        
        tone="error"
        title={tx(L.annError, lang)}
        message={state.error}
        retryLabel={retryLabel}
        onRetry={state.reload}
      />
    );
  }
  if ((state.data ?? []).length === 0) {
    return <StateView  title={tx(L.annEmpty, lang)} />;
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
        
        tone="error"
        title={tx(L.actError, lang)}
        message={state.error}
        retryLabel={retryLabel}
        onRetry={state.reload}
      />
    );
  }
  if ((state.data ?? []).length === 0) {
    return <StateView  title={tx(L.actEmpty, lang)} />;
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

function TasksList({
  state,
  lang,
  retryLabel,
  onReload,
}: {
  state: ReturnType<typeof useApi<BoothTask[]>>;
  lang: Lang;
  retryLabel: string;
  onReload: () => void;
}) {
  const { api } = useAuth();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  async function completeTask(taskId: string) {
    try {
      await api(`/booth-tasks/${taskId}/complete`, { method: "POST" });
      setDoneIds((prev) => new Set([...prev, taskId]));
    } catch {
      // Already done or error — ignore
    }
  }

  if (state.loading && !state.data) return <RowSkeletons />;
  if (state.error && !state.data) {
    return <StateView tone="error" title="Couldn't load tasks" message={state.error} retryLabel={retryLabel} onRetry={onReload} />;
  }
  if ((state.data ?? []).length === 0) {
    return <StateView title={tx(L.taskEmpty, lang)} />;
  }
  return (
    <View>
      {(state.data ?? []).map((task) => {
        const done = task.done || doneIds.has(task.id);
        return (
          <Card key={task.id} style={done ? { ...st.actCard, opacity: 0.6 } : st.actCard}>
            <View style={st.actMain}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {done && <Text style={{ color: colors.success }}>✓</Text>}
                <Text style={[st.actLabel, done && { textDecorationLine: "line-through" }]} numberOfLines={2}>
                  {task.title}
                </Text>
              </View>
              {task.description ? <Text style={st.annBody} numberOfLines={2}>{task.description}</Text> : null}
              {task.dueAt ? <Text style={st.date}>{lang === "te" ? "గడువు: " : "Due: "}{fmtDate(task.dueAt)}</Text> : null}
            </View>
            {!done && (
              <Pressable onPress={() => completeTask(task.id)} style={({ pressed }) => [st.doneBtn, pressed && { opacity: 0.75 }]}>
                <Text style={st.doneBtnText}>{lang === "te" ? "పూర్తి" : "Done"}</Text>
              </Pressable>
            )}
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
  content: { padding: 16, paddingBottom: 96 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  screenTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 14, fontFamily: fontFamily, lineHeight: lh(22) },

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
  segText: { fontWeight: "700", color: colors.textMuted, fontSize: 13, fontFamily: fontFamily, lineHeight: lh(13) },
  segTextActive: { color: "#fff", fontFamily: fontFamily },

  annTitle: { fontSize: 16, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(16) },
  annBody: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20, fontFamily: fontFamily },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 10, fontFamily: fontFamily, lineHeight: lh(12) },

  actCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  actMain: { flex: 1 },
  actLabel: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(15) },

  skelCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skelRow: { flexDirection: "row", alignItems: "center", gap: 12 },

  waBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#25D366", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12, alignSelf: "flex-start" },
  waIcon: { fontSize: 16 },
  waBtnText: { color: "#fff", fontWeight: "700", fontSize: 14, fontFamily, lineHeight: lh(14) },
  doneBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  doneBtnText: { color: "#fff", fontWeight: "700", fontSize: 12, fontFamily, lineHeight: lh(12) },
});
