import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fontFamily, lh, radius } from "../theme";
import { STATUS_COLORS, voterName, type Voter } from "../lib/voters";

/**
 * One family-member line on the voter detail screen — richer than VoterRow:
 * status dot, name, age · gender · relation, mobile if known, plus a phone
 * action (call when set, inline capture when missing, long-press / pencil
 * to correct). Saving is delegated to the parent via onSaveMobile.
 */
export function FamilyMemberRow({
  member,
  lang,
  onPress,
  onSaveMobile,
}: {
  member: Voter;
  lang: "te" | "en";
  onPress: () => void;
  onSaveMobile: (mobile: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta: string[] = [];
  if (member.age != null) meta.push(String(member.age));
  if (member.gender) meta.push(member.gender);
  if (member.relationName) meta.push(member.relationName);

  function startEdit() {
    setDraft(member.mobile ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveMobile(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onPhonePress() {
    if (member.mobile) void Linking.openURL(`tel:${member.mobile}`);
    else if (editing) setEditing(false);
    else startEdit();
  }

  return (
    <View style={st.wrap}>
      <View style={st.row}>
        <Pressable onPress={onPress} style={({ pressed }) => [st.main, pressed && { opacity: 0.75 }]}>
          <View
            style={[
              st.dot,
              { backgroundColor: STATUS_COLORS[member.votingStatus] ?? STATUS_COLORS.unmarked },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>
              {voterName(member, lang)}
            </Text>
            <Text style={st.meta} numberOfLines={1}>
              {meta.length > 0 ? meta.join(" · ") : "—"}
            </Text>
            {member.mobile ? (
              <Text style={st.mobile} numberOfLines={1}>
                {member.mobile}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          onPress={onPhonePress}
          onLongPress={member.mobile ? startEdit : undefined}
          hitSlop={8}
          style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="phone" size={16} color={member.mobile ? colors.success : colors.primary} />
        </Pressable>
        {member.mobile ? (
          <Pressable
            onPress={() => (editing ? setEditing(false) : startEdit())}
            hitSlop={8}
            style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="edit-2" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>

      {editing ? (
        <View style={st.editRow}>
          <TextInput
            style={st.editInput}
            value={draft}
            onChangeText={setDraft}
            keyboardType="phone-pad"
            placeholder="9XXXXXXXXX"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={({ pressed }) => [st.saveBtn, (pressed || saving) && { opacity: 0.7 }]}
          >
            <Text style={st.saveBtnText}>{saving ? "…" : lang === "te" ? "సేవ్" : "Save"}</Text>
          </Pressable>
          <Pressable onPress={() => setEditing(false)} hitSlop={8} style={st.iconBtn}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={st.error}>⚠️ {error}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    fontFamily,
    lineHeight: lh(15),
  },
  meta: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12), marginTop: 2 },
  mobile: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    fontFamily,
    lineHeight: lh(12),
    marginTop: 2,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  editInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: colors.text,
    fontFamily,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily, lineHeight: lh(13) },

  error: { color: colors.danger, fontSize: 12, fontFamily, lineHeight: lh(12), marginTop: 6 },
});
