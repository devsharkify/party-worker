import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, lh, radius } from "../theme";
import type { VoterChange } from "../lib/voters";

/**
 * Per-change chips like "votingStatus: unmarked → green" —
 * shared by voters/my-changes and the voter-detail history section.
 */
export function ChangeChips({ changes }: { changes: VoterChange[] }) {
  if (changes.length === 0) return null;
  return (
    <View style={st.wrap}>
      {changes.map((c, i) => (
        <View key={`${c.field}-${i}`} style={st.chip}>
          <Text style={st.field}>{c.field}</Text>
          <Text style={st.values} numberOfLines={1}>
            {fmt(c.from)} → {fmt(c.to)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function fmt(value: string | null): string {
  return value == null || value === "" ? "—" : String(value);
}

const st = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  field: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    fontFamily,
    lineHeight: lh(11),
  },
  values: {
    flexShrink: 1,
    fontSize: 11,
    color: colors.text,
    fontFamily,
    lineHeight: lh(11),
  },
});
