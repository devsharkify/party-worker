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
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../src/auth/auth-context";
import { PrimaryButton } from "../../src/components/ui";
import { API_URL } from "../../src/config";
import { colors, radius, shadow } from "../../src/theme";

/** Fetch wrapper for public (unauthenticated) invite endpoints. */
function publicFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "bypass-tunnel-reminder": "true",
      ...(opts.headers ?? {}),
    },
  });
}

interface InviteStatus {
  orgUnitName: string;
  role: string;
  inviterName?: string;
  valid: boolean;
}

// Telugu-first copy — this is a recruit's FIRST contact with the party.
const L = {
  checking: "ఆహ్వానం తనిఖీ అవుతోంది… (Checking invite…)",
  invalidLink: "ఆహ్వాన లింక్ చెల్లదు. (Invalid invite link.)",
  notFound: "ఆహ్వానం దొరకలేదు లేదా గడువు ముగిసింది.",
  unavailable: "ఆహ్వానం అందుబాటులో లేదు",
  unavailableBody: "ఈ ఆహ్వాన లింక్ చెల్లదు లేదా గడువు ముగిసింది.",
  backToLogin: "← లాగిన్‌కు వెళ్లండి",
  invited: "మీకు ఆహ్వానం వచ్చింది!",
  joinAs: (unit: string, role: string) => `${unit}లో ${role}గా చేరండి`,
  invitedBy: (name: string) => `ఆహ్వానించినవారు: ${name}`,
  nameLabel: "మీ పూర్తి పేరు",
  namePh: "మీ పేరు రాయండి",
  phoneLabel: "ఫోన్ నంబర్",
  nameErr: "దయచేసి మీ పూర్తి పేరు రాయండి.",
  phoneErr: "సరైన 10 అంకెల ఫోన్ నంబర్ ఇవ్వండి.",
  acceptFail: "ఆహ్వానం స్వీకరించడం విఫలమైంది.",
  accept: "అంగీకరించి చేరండి",
  otpHint: "అంగీకరించిన తర్వాత మీ ఫోన్‌కు OTP వస్తుంది.",
  welcome: "స్వాగతం!",
  welcomeBody: "మీ ఖాతా సృష్టించబడింది. లాగిన్ పూర్తి చేయడానికి మీ ఫోన్‌లో OTP చూడండి.",
};

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
      setErrorMsg(L.invalidLink);
      setState("error");
      return;
    }
    publicFetch(`/invites/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? L.notFound);
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
      setFieldError(L.nameErr);
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setFieldError(L.phoneErr);
      return;
    }
    setState("submitting");
    try {
      const res = await publicFetch(`/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? L.acceptFail);
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
        <Text style={st.title}>myTRS</Text>

        {state === "loading" && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={st.loadingText}>{L.checking}</Text>
          </View>
        )}

        {state === "error" && (
          <View style={st.card}>
            <Feather name="alert-triangle" size={40} color={colors.danger} />
            <Text style={st.errorHeading}>{L.unavailable}</Text>
            <Text style={st.errorBody}>
              {errorMsg ?? L.unavailableBody}
            </Text>
            <Pressable onPress={() => router.replace("/login")} style={st.backLink}>
              <Text style={st.backLinkText}>{L.backToLogin}</Text>
            </Pressable>
          </View>
        )}

        {(state === "ready" || state === "submitting") && invite && (
          <View style={st.card}>
            <Text style={st.inviteHeading}>{L.invited}</Text>
            <Text style={st.inviteBody}>
              <Text style={st.highlight}>{L.joinAs(invite.orgUnitName, invite.role)}</Text>
            </Text>
            {invite.inviterName ? (
              <Text style={st.inviter}>{L.invitedBy(invite.inviterName)}</Text>
            ) : null}

            <View style={st.divider} />

            <Text style={st.label}>{L.nameLabel}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={L.namePh}
              placeholderTextColor="#94a3b8"
              style={st.input}
              returnKeyType="next"
              editable={state !== "submitting"}
            />

            <Text style={st.label}>{L.phoneLabel}</Text>
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
              title={L.accept}
              onPress={onAccept}
              loading={state === "submitting"}
              disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}
            />

            <Text style={st.hint}>
              {L.otpHint}
            </Text>
          </View>
        )}

        {state === "done" && (
          <View style={st.card}>
            <Feather name="check-circle" size={40} color={colors.success} />
            <Text style={st.successHeading}>{L.welcome}</Text>
            <Text style={st.successBody}>
              {L.welcomeBody}
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    fontWeight: "700",
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
