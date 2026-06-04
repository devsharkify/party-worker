import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../src/auth/auth-context";
import { setLanguage } from "../src/i18n";
import { PrimaryButton } from "../src/components/ui";
import { colors, radius, shadow } from "../src/theme";

export default function Login() {
  const { t, i18n } = useTranslation();
  const { requestOtp, login } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [devHint, setDevHint] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSend() {
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestOtp(phone);
      setDevHint(r.devHint);
      setStep("otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setError(undefined);
    setBusy(true);
    try {
      await login(phone, code);
      router.replace("/feed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={st.wrap}>
        <View style={st.langRow}>
          {(["te", "en"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLanguage(l)}
              style={[st.lang, i18n.language === l && st.langActive]}
            >
              <Text style={[st.langText, i18n.language === l && st.langTextActive]}>
                {l === "te" ? "తెలుగు" : "English"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={st.logoRing}>
          <Text style={st.logo}>★</Text>
        </View>
        <Text style={st.title}>{t("common.appName")}</Text>
        <Text style={st.subtitle}>{t("auth.loginSubtitle")}</Text>

        <View style={st.card}>
          {step === "phone" ? (
            <>
              <Text style={st.label}>{t("auth.phoneLabel")}</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder={t("auth.phonePlaceholder")}
                placeholderTextColor="#94a3b8"
                style={st.input}
                maxLength={13}
                autoFocus
              />
              <PrimaryButton
                title={t("auth.sendOtp")}
                onPress={onSend}
                loading={busy}
                disabled={phone.replace(/\D/g, "").length < 10}
              />
            </>
          ) : (
            <>
              <Text style={st.label}>{t("auth.otpLabel")}</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder={t("auth.otpPlaceholder")}
                placeholderTextColor="#94a3b8"
                style={st.input}
                maxLength={6}
                autoFocus
              />
              {devHint ? <Text style={st.hint}>{t("auth.devHint", { code: devHint })}</Text> : null}
              <PrimaryButton
                title={t("auth.verify")}
                onPress={onVerify}
                loading={busy}
                disabled={code.length < 4}
              />
              <Pressable onPress={() => setStep("phone")} style={{ marginTop: 12 }}>
                <Text style={st.back}>{t("common.back")}</Text>
              </Pressable>
              <Text style={st.otpSent}>{t("auth.otpSentTo", { phone })}</Text>
            </>
          )}
          {error ? <Text style={st.error}>{error}</Text> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "center", maxWidth: 460, width: "100%", alignSelf: "center" },
  langRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginBottom: 24 },
  lang: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.textMutedOnDark },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.textMutedOnDark, fontWeight: "600" },
  langTextActive: { color: "#fff" },
  logoRing: {
    alignSelf: "center",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,153,51,0.14)",
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { fontSize: 44, textAlign: "center", color: colors.primary, lineHeight: 52 },
  title: { fontSize: 30, fontWeight: "800", color: "#fff", textAlign: "center", marginTop: 14 },
  subtitle: { fontSize: 15, color: colors.textMutedOnDark, textAlign: "center", marginTop: 6, marginBottom: 28 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    ...shadow,
    shadowColor: "#000",
    shadowOpacity: 0.25,
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 18,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  back: { color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  otpSent: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 14 },
  error: { color: colors.danger, marginTop: 14, textAlign: "center", fontWeight: "600" },
});
