import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import type { CheckInResult, EventItem, RsvpResult, RsvpStatus } from "@pw/shared";
import { LEADER_ROLES } from "@pw/shared";
import { useAuth } from "../auth/auth-context";
import { Feather } from "@expo/vector-icons";
import { Card, Pill, PrimaryButton } from "./ui";
import { colors, fontFamily, lh, radius } from "../theme";

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
  const { api, user } = useAuth();
  const router = useRouter();
  const isLeader = user ? LEADER_ROLES.includes(user.role as any) : false;
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(event.rsvpStatus);
  const [checkedIn, setCheckedIn] = useState(event.checkedIn);
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);

  async function capturePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") return;
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: "checkin.jpg", type: "image/jpeg" } as any);
      const up = await api<{ key: string }>("/creatives/upload", { method: "POST", body: form });
      setPhotoKey(up.key);
    } catch {
      // camera error — silently skip, photo is optional
    }
  }

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
      // Request GPS to satisfy the geo-fence on the server.
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        // GPS optional — server will allow without coords but mark unverified.
      }

      const res = await api<CheckInResult>(`/events/${event.id}/checkin`, {
        method: "POST",
        body: JSON.stringify({ qrToken: event.qrToken, lat, lng, ...(photoKey ? { photoKey } : {}) }),
      });
      setCheckedIn(res.checkedIn);
      if (res.pointsAwarded > 0) setAwarded(res.pointsAwarded);
      onChanged();
    } catch (err: any) {
      Alert.alert(t("events.checkInFailed"), err?.message ?? String(err));
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
          <View style={st.checkInRow}>
            <PrimaryButton title={t("events.checkIn")} onPress={checkIn} loading={busy} />
            <Pressable onPress={capturePhoto} style={st.cameraBtn} disabled={busy}>
              <Text style={st.cameraBtnText}>{photoKey ? "📷✓" : "📷"}</Text>
            </Pressable>
          </View>
        )}
      </View>
      {awarded != null ? (
        <Text style={st.points}>{t("events.pointsEarned", { points: awarded })}</Text>
      ) : null}
      {isLeader ? (
        <Pressable style={st.attendanceLink} onPress={() => router.push(`/event-attendance/${event.id}` as any)}>
          <Feather name="users" size={14} color={colors.primaryDark} />
          <Text style={st.attendanceLinkText}>{t("events.viewAttendance")}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(18) },
  when: { fontSize: 14, color: colors.primaryDark, fontWeight: "700", marginTop: 4, fontFamily: fontFamily, lineHeight: lh(14) },
  location: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontFamily: fontFamily, lineHeight: lh(13) },
  desc: { fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20, fontFamily: fontFamily },
  rsvpLabel: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 14, fontFamily: fontFamily, lineHeight: lh(13) },
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
  rsvpText: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
  rsvpTextActive: { color: "#fff", fontFamily: fontFamily },
  footer: { marginTop: 14 },
  checkInRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cameraBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  cameraBtnText: { fontSize: 18 },
  points: { marginTop: 10, textAlign: "center", color: colors.success, fontWeight: "700", fontFamily: fontFamily },
  attendanceLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  attendanceLinkText: { fontSize: 13, color: colors.primaryDark, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(13) },
});
