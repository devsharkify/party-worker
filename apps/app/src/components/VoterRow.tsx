import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fontFamily, lh, radius } from "../theme";
import { STATUS_COLORS, voterName, type Voter } from "../lib/voters";

/**
 * One voter line — shared by voters/list and voters/search.
 * Shows the status dot, name (Telugu when available + selected), serial/part,
 * age·gender, house no and a voted checkmark on election day.
 */
export function VoterRow({
  voter,
  lang,
  onPress,
}: {
  voter: Voter;
  lang: "te" | "en";
  onPress: () => void;
}) {
  const meta: string[] = [];
  if (voter.serialNo != null) meta.push(`#${voter.serialNo}`);
  if (voter.partNo != null) meta.push(lang === "te" ? `భాగం ${voter.partNo}` : `Part ${voter.partNo}`);
  const ageGender = [voter.age != null ? `${voter.age}` : null, voter.gender || null]
    .filter(Boolean)
    .join(" · ");
  if (ageGender) meta.push(ageGender);
  if (voter.houseNo) meta.push(lang === "te" ? `ఇల్లు ${voter.houseNo}` : `H.No ${voter.houseNo}`);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.75 }]}>
      <View style={[st.dot, { backgroundColor: STATUS_COLORS[voter.votingStatus] ?? STATUS_COLORS.unmarked }]} />
      <View style={{ flex: 1 }}>
        <View style={st.nameLine}>
          <Text style={st.name} numberOfLines={1}>
            {voterName(voter, lang)}
          </Text>
          {voter.isVoted ? (
            <Feather name="check-circle" size={15} color={STATUS_COLORS.green} />
          ) : null}
        </View>
        <Text style={st.meta} numberOfLines={1}>
          {meta.join("  ·  ")}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    fontFamily,
    lineHeight: lh(15),
  },
  meta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 2 },
});
