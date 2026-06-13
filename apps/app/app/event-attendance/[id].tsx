import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import type { AttendanceRow } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { Screen } from "../../src/components/ui";
import { colors, fontFamily, lh, radius } from "../../src/theme";

function distanceLabel(metres: number | null): string {
  if (metres == null) return "";
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

function Initials({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={st.avatar} />;
  }
  const letters = name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <View style={st.avatarFallback}>
      <Text style={st.avatarText}>{letters}</Text>
    </View>
  );
}

function Row({ row }: { row: AttendanceRow }) {
  const time = new Date(row.checkedInAt).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View style={st.row}>
      <Initials name={row.name} photoUrl={row.photoUrl} />
      <View style={st.info}>
        <Text style={st.name}>{row.name}</Text>
        <Text style={st.meta}>
          {time}
          {row.distanceMetres != null ? `  ·  ${distanceLabel(row.distanceMetres)}` : ""}
        </Text>
      </View>
      <View style={[st.badge, row.verified ? st.badgeOk : st.badgePending]}>
        <Text style={st.badgeText}>{row.verified ? "GPS" : "QR"}</Text>
      </View>
    </View>
  );
}

export default function EventAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data, loading, error } = useApi<AttendanceRow[]>(`/events/${id}/attendance`);

  if (loading && !data) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={st.center}>
        <Text style={st.err}>{error}</Text>
      </View>
    );
  }

  return (
    <Screen>
      <Text style={st.heading}>
        {t("events.attendance")} ({data?.length ?? 0})
      </Text>
      {data?.length === 0 ? (
        <Text style={st.empty}>{t("events.noAttendance")}</Text>
      ) : (
        data?.map((row) => <Row key={row.userId} row={row} />)
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  err: { color: colors.danger, fontFamily: fontFamily, textAlign: "center" },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(18), marginBottom: 16 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: fontFamily, lineHeight: lh(15) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700", color: colors.primary, fontFamily: fontFamily },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(15) },
  meta: { fontSize: 12, color: colors.textMuted, fontFamily: fontFamily, lineHeight: lh(12), marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  badgeOk: { backgroundColor: colors.success + "22" },
  badgePending: { backgroundColor: colors.textMuted + "22" },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, fontFamily: fontFamily },
});
