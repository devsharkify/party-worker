import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../src/auth/auth-context";
import { PrimaryButton, Screen } from "../src/components/ui";
import { colors, fontFamily, lh, radius } from "../src/theme";

export default function ComposeAnnouncement() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { api, user } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const trimTitle = title.trim();
    const trimBody = body.trim();
    if (!trimTitle) {
      Alert.alert(t("announce.titleRequired"));
      return;
    }
    if (!trimBody) {
      Alert.alert(t("announce.bodyRequired"));
      return;
    }

    setSending(true);
    try {
      await api("/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: trimTitle,
          body: trimBody,
          // Scope to the leader's own org unit (API enforces subtree rule).
          targetOrgUnitId: user?.orgUnitId ?? undefined,
        }),
      });
      router.back();
    } catch (err: any) {
      Alert.alert(t("announce.sendFailed"), err?.message ?? String(err));
    } finally {
      setSending(false);
    }
  }

  const isTeluguFirst = lang === "te";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <Text style={st.heading}>
          {isTeluguFirst
            ? "ప్రకటన రాయండి / Compose Announcement"
            : "Compose Announcement / ప్రకటన రాయండి"}
        </Text>

        <Text style={st.label}>{t("announce.titleLabel")}</Text>
        <TextInput
          style={st.input}
          placeholder={t("announce.titlePlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={140}
          returnKeyType="next"
        />

        <Text style={st.label}>{t("announce.bodyLabel")}</Text>
        <TextInput
          style={[st.input, st.multiline]}
          placeholder={t("announce.bodyPlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={body}
          onChangeText={setBody}
          maxLength={1000}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <View style={st.hint}>
          <Text style={st.hintText}>
            {t("announce.targetHint", { unit: user?.orgUnitName ?? "" })}
          </Text>
        </View>

        {sending ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <PrimaryButton title={t("announce.send")} onPress={send} style={st.btn} />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  heading: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    fontFamily: fontFamily,
    lineHeight: lh(18),
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    fontFamily: fontFamily,
    lineHeight: lh(13),
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: fontFamily,
    marginBottom: 16,
  },
  multiline: {
    minHeight: 120,
    paddingTop: 12,
  },
  hint: {
    backgroundColor: colors.primary + "18",
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 20,
  },
  hintText: {
    fontSize: 13,
    color: colors.primaryDark,
    fontFamily: fontFamily,
    lineHeight: lh(13),
  },
  btn: { marginTop: 4 },
});
