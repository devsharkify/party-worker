import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/auth/auth-context";
import { PrimaryButton } from "../../src/components/ui";
import { API_URL } from "../../src/config";
import { colors, radius, shadow } from "../../src/theme";

interface InviteStatus {
  orgUnitName: string;
  role: string;
  inviterName?: string;
  valid: boolean;
}

type ScreenState = "loading" | "ready" | "error" | "submitting" | "done";

export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [state, setState] = useState<ScreenState>("loading");
  const [invite, setInvite] = useState<InviteStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid invite link.");
      setState("error");
      return;
    }
    fetch(`${API_URL}/invites/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? "Invite not found or expired.");
        }
        return res.json() as Promise<InviteStatus>;
      })
      .then((data) => {
        setInvite(data);
        setState("ready");
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
        setState("error");
      });
  }, [token]);

  // Pre-fill name when user becomes available (e.g. slow auth load)
  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user?.name]);

  async function onAccept() {
    setFieldError(undefined);
    if (!name.trim()) {
      setFieldError("Please enter your full name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setFieldError("Please enter a valid 10-digit phone number.");
      return;
    }
    setState("submitting");
    try {
      const res = await fetch(`${API_URL}/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to accept invite.");
      }
      setState("done");
      // Small delay so the user sees the success state, then navigate to login
      setTimeout(() => {
        router.replace("/login?invited=1");
      }, 1200);
    } catch (e: unknown) {
      setErrorMsg((e as Error).message);
      setState("error");
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={st.wrap}>
        <View style={st.logoRing}>
          <Text style={st.logo}>★</Text>
        </View>
        <Text style={st.title}>Party Worker</Text>

        {state === "loading" && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={st.loadingText}>Checking invite…</Text>
          </View>
        )}

        {state === "error" && (
          <View style={st.card}>
            <Text style={st.errorIcon}>⚠️</Text>
            <Text style={st.errorHeading}>Invite Unavailable</Text>
            <Text style={st.errorBody}>
              {errorMsg ?? "This invite link is invalid or has expired."}
            </Text>
            <Pressable onPress={() => router.replace("/login")} style={st.backLink}>
              <Text style={st.backLinkText}>← Back to Login</Text>
            </Pressable>
          </View>
        )}

        {(state === "ready" || state === "submitting") && invite && (
          <View style={st.card}>
            <Text style={st.inviteHeading}>You've been invited!</Text>
            <Text style={st.inviteBody}>
              Join{" "}
              <Text style={st.highlight}>{invite.orgUnitName}</Text>
              {" "}as{" "}
              <Text style={st.highlight}>{invite.role}</Text>
            </Text>
            {invite.inviterName ? (
              <Text style={st.inviter}>Invited by {invite.inviterName}</Text>
            ) : null}

            <View style={st.divider} />

            <Text style={st.label}>Your Full Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor="#94a3b8"
              style={st.input}
              returnKeyType="next"
              editable={state !== "submitting"}
            />

            <Text style={st.label}>Phone Number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+91XXXXXXXXXX"
              placeholderTextColor="#94a3b8"
              style={st.input}
              maxLength={13}
              returnKeyType="done"
              editable={state !== "submitting"}
            />

            {fieldError ? <Text style={st.fieldError}>{fieldError}</Text> : null}

            <PrimaryButton
              title="Accept & Join"
              onPress={onAccept}
              loading={state === "submitting"}
              disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}
            />

            <Text style={st.hint}>
              You'll receive an OTP to verify your phone number after accepting.
            </Text>
          </View>
        )}

        {state === "done" && (
          <View style={st.card}>
            <Text style={st.successIcon}>✅</Text>
            <Text style={st.successHeading}>Welcome aboard!</Text>
            <Text style={st.successBody}>
              Your account has been created. Check your phone for an OTP to complete login.
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },
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
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginTop: 14,
    marginBottom: 28,
  },
  center: { alignItems: "center", gap: 14 },
  loadingText: { color: colors.textMutedOnDark, fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    ...shadow,
    shadowColor: "#000",
    shadowOpacity: 0.25,
  },
  // Invite ready state
  inviteHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  inviteBody: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 24,
  },
  highlight: { color: colors.primary, fontWeight: "700" },
  inviter: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
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
  fieldError: { color: colors.danger, fontSize: 13, marginBottom: 12, fontWeight: "600" },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 18,
  },
  // Error state
  errorIcon: { fontSize: 36, textAlign: "center", marginBottom: 10 },
  errorHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  backLink: { alignSelf: "center" },
  backLinkText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  // Success state
  successIcon: { fontSize: 44, textAlign: "center", marginBottom: 10 },
  successHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  successBody: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
