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
import { TRSLogo } from "../src/components/TRSLogo";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

export default function Login() {
  const { t, i18n } = useTranslation();
  const { requestOtp, login } = useAuth();
  const router = useRouter();

  const COUNTRY_CODE = "+91";
  const [digits, setDigits] = useState("");
  const phone = `${COUNTRY_CODE}${digits}`;
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

        <View style={st.logoWrap}>
          <TRSLogo size={96} showBanner borderRadius={8} />
        </View>
        <Text style={st.title}>{t("common.appName")}</Text>
        <Text style={st.subtitle}>{t("auth.loginSubtitle")}</Text>

        <View style={st.card}>
          {step === "phone" ? (
            <>
              <Text style={st.label}>{t("auth.phoneLabel")}</Text>
              <View style={st.phoneRow}>
                <View style={st.countryCode}>
                  <Text style={st.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  value={digits}
                  onChangeText={(v) => setDigits(v.replace(/\D/g, "").slice(0, 10))}
                  keyboardType="number-pad"
                  placeholder="10-digit number"
                  placeholderTextColor="#94a3b8"
                  style={[st.input, st.phoneInput]}
                  maxLength={10}
                  autoFocus
                />
              </View>
              <PrimaryButton
                title={t("auth.sendOtp")}
                onPress={onSend}
                loading={busy}
                disabled={digits.length < 10}
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
              <Pressable onPress={() => setStep("phone")} style={({ pressed }) => [{ marginTop: 12 }, pressed && { opacity: 0.75 }]}>
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
  lang: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.textMuted, fontWeight: "600", fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
  langTextActive: { color: "#fff", fontFamily: fontFamily },
  logoWrap: {
    alignSelf: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 30, fontWeight: "800", color: colors.navy, textAlign: "center", marginTop: 14, fontFamily: fontFamily, lineHeight: lh(30) },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginTop: 6, marginBottom: 28, fontFamily: fontFamily, lineHeight: lh(15) },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    borderWidth: 1.5,
    borderColor: colors.primary + "44",
    ...shadow,
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8, fontFamily: fontFamily, lineHeight: lh(14) },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  countryCode: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 52,
    justifyContent: "center",
    backgroundColor: colors.cardMuted,
  },
  countryCodeText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    fontFamily: fontFamily,
    lineHeight: lh(18),
  },
  phoneInput: {
    flex: 1,
    marginBottom: 0,
  },
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
    fontFamily: fontFamily,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 12, fontFamily: fontFamily, lineHeight: lh(13) },
  back: { color: colors.textMuted, textAlign: "center", fontWeight: "600", fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
  otpSent: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 14, fontFamily: fontFamily, lineHeight: lh(13) },
  error: { color: colors.danger, marginTop: 14, textAlign: "center", fontWeight: "600", fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
});
