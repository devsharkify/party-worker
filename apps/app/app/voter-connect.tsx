import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../src/auth/auth-context";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

export default function VoterConnect() {
  const router = useRouter();
  const { api } = useAuth();
  const { i18n } = useTranslation();
  const lang = i18n.language as "te" | "en";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api("/contacts", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined, notes: notes.trim() || undefined }),
      });
      setDone(true);
      setName(""); setPhone(""); setAddress(""); setNotes("");
    } finally {
      setBusy(false);
    }
  }

  const title = lang === "te" ? "ఓటరు నమోదు" : "Voter Connect";
  const nameLbl = lang === "te" ? "పేరు *" : "Name *";
  const phoneLbl = lang === "te" ? "ఫోన్ నంబర్" : "Phone";
  const addrLbl = lang === "te" ? "చిరునామా" : "Address";
  const notesLbl = lang === "te" ? "గమనికలు" : "Notes";
  const saveLbl = lang === "te" ? "నమోదు చేయి (+5 పాయింట్లు)" : "Register (+5 pts)";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={st.fill} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {done && (
          <View style={st.successBanner}>
            <Text style={st.successText}>
              {lang === "te" ? "✓ నమోదు అయింది! +5 పాయింట్లు సంపాదించారు" : "✓ Registered! +5 pts earned"}
            </Text>
          </View>
        )}

        <Text style={st.hint}>
          {lang === "te"
            ? "మీ బూత్ ప్రాంతంలో ఓటర్లను నమోదు చేయండి. ప్రతి నమోదుకు +5 పాయింట్లు."
            : "Register voters in your booth area. +5 pts per registration."}
        </Text>

        <Text style={st.label}>{nameLbl}</Text>
        <TextInput
          style={st.input}
          value={name}
          onChangeText={setName}
          placeholder={lang === "te" ? "ఓటరు పేరు" : "Voter name"}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={st.label}>{phoneLbl}</Text>
        <TextInput
          style={st.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="9XXXXXXXXX"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
        />

        <Text style={st.label}>{addrLbl}</Text>
        <TextInput
          style={st.input}
          value={address}
          onChangeText={setAddress}
          placeholder={lang === "te" ? "ఇల్లు నంబర్, వీధి" : "House no, street"}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={st.label}>{notesLbl}</Text>
        <TextInput
          style={[st.input, { minHeight: 72, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={lang === "te" ? "ఏదైనా ప్రత్యేక సమాచారం" : "Any special notes"}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Pressable
          onPress={submit}
          disabled={!name.trim() || busy}
          style={({ pressed }) => [st.btn, (!name.trim() || busy) && st.btnDisabled, pressed && { opacity: 0.8 }]}
        >
          <Text style={st.btnText}>{busy ? "…" : saveLbl}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(18) },
  content: { padding: 20, gap: 4 },
  successBanner: { backgroundColor: "#166534", borderRadius: radius.lg, padding: 14, marginBottom: 16 },
  successText: { color: "#bbf7d0", fontWeight: "700", fontFamily, lineHeight: lh(14) },
  hint: { fontSize: 13, color: colors.textMuted, fontFamily, lineHeight: lh(13), marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, fontFamily, lineHeight: lh(13), marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text, fontFamily,
    ...shadow,
  },
  btn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: "center", marginTop: 24, ...shadow,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 15, fontFamily, lineHeight: lh(15) },
});
