import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { EventItem } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { Screen } from "../../src/components/ui";
import { EventCard } from "../../src/components/EventCard";
import { colors, fontFamily, lh } from "../../src/theme";

export default function Events() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useApi<EventItem[]>("/events");

  if (loading && !data) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Screen>
      {error && !data ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Text style={st.empty}>{t("events.empty")}</Text> : null}
      {(data ?? []).map((ev) => (
        <EventCard key={ev.id} event={ev} onChanged={reload} />
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardMuted },
  error: { color: colors.danger, fontWeight: "700", marginBottom: 12, fontFamily: fontFamily },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: fontFamily, lineHeight: lh(15) },
});
