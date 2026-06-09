import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CheckInResult, EventItem, RsvpResult, RsvpStatus } from "@pw/shared";
import { useAuth } from "../auth/auth-context";
import { Feather } from "@expo/vector-icons";
import { Card, Pill, PrimaryButton } from "./ui";
import { colors, radius } from "../theme";

const RSVP_OPTIONS: RsvpStatus[] = ["going", "maybe", "no"];

function formatWhen(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang === "te" ? "te-IN" : "en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EventCard({ event, onChanged }: { event: EventItem; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { api } = useAuth();
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(event.rsvpStatus);
  const [checkedIn, setCheckedIn] = useState(event.checkedIn);
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);

  async function chooseRsvp(status: RsvpStatus) {
    setBusy(true);
    try {
      await api<RsvpResult>(`/events/${event.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setRsvp(status);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    setBusy(true);
    try {
      const res = await api<CheckInResult>(`/events/${event.id}/checkin`, {
        method: "POST",
        body: JSON.stringify({ qrToken: event.qrToken }),
      });
      setCheckedIn(res.checkedIn);
      if (res.pointsAwarded > 0) setAwarded(res.pointsAwarded);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={st.title}>{event.title}</Text>
      <Text style={st.when}>{formatWhen(event.startsAt, lang)}</Text>
      {event.location ? <Text style={st.location}>📍 {event.location}</Text> : null}
      {event.description ? (
        <Text style={st.desc} numberOfLines={3}>
          {event.description}
        </Text>
      ) : null}

      <Text style={st.rsvpLabel}>{t("events.rsvp")}</Text>
      <View style={st.rsvpRow}>
        {RSVP_OPTIONS.map((opt) => {
          const active = rsvp === opt;
          return (
            <Pressable
              key={opt}
              disabled={busy}
              onPress={() => chooseRsvp(opt)}
              style={[st.rsvpBtn, active && st.rsvpBtnActive]}
            >
              <Text style={[st.rsvpText, active && st.rsvpTextActive]}>{t(`events.${opt}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={st.footer}>
        {checkedIn ? (
          <Pill label={t("events.checkedIn")} color={colors.success} />
        ) : (
          <PrimaryButton title={t("events.checkIn")} onPress={checkIn} loading={busy} />
        )}
      </View>
      {awarded != null ? (
        <Text style={st.points}>{t("events.pointsEarned", { points: awarded })}</Text>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  when: { fontSize: 14, color: colors.primaryDark, fontWeight: "700", marginTop: 4 },
  location: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  desc: { fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20 },
  rsvpLabel: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 14 },
  rsvpRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  rsvpBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
  },
  rsvpBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rsvpText: { fontWeight: "700", color: colors.text, fontSize: 14 },
  rsvpTextActive: { color: "#fff" },
  footer: { marginTop: 14 },
  points: { marginTop: 10, textAlign: "center", color: colors.success, fontWeight: "800" },
});
