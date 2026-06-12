import { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { toast } from "sonner-native";
import { useAuth } from "../src/auth/auth-context";
import { useApi } from "../src/hooks";
import { SkeletonBlock } from "../src/components/Skeleton";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

interface OrgUnitNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

interface CreateInviteResult {
  token: string;
  url: string;
  orgUnitId: string;
  role: string;
  expiresAt: string;
}

const L = {
  title: { te: "లింక్ ద్వారా ఆహ్వానించండి", en: "Invite via link" },
  intro: {
    te: "లింక్ పంపండి — కార్యకర్త తన పేరు, నంబర్‌తో నేరుగా చేరతాడు. మీకు రిక్రూట్ పాయింట్లు లభిస్తాయి.",
    en: "Send a link — the recruit joins with their own name and number. You earn recruit points.",
  },
  unitLabel: { te: "ఏ యూనిట్‌లో చేర్చాలి?", en: "Which unit do they join?" },
  mint: { te: "ఆహ్వాన లింక్ సృష్టించండి", en: "Create invite link" },
  minting: { te: "సృష్టిస్తోంది…", en: "Creating…" },
  yourLink: { te: "మీ ఆహ్వాన లింక్ (7 రోజులు చెల్లుతుంది)", en: "Your invite link (valid 7 days)" },
  whatsapp: { te: "వాట్సాప్‌లో పంపండి", en: "Send on WhatsApp" },
  copy: { te: "లింక్ కాపీ చేయండి", en: "Copy link" },
  copied: { te: "కాపీ అయింది!", en: "Copied!" },
  share: { te: "ఇతర యాప్‌లలో షేర్ చేయండి", en: "Share via other apps" },
  failed: { te: "లింక్ సృష్టించడం విఫలమైంది", en: "Could not create the link" },
  message: (url: string) =>
    `తెలంగాణ రక్షణ సేన (TRS)లో చేరండి! myTRS యాప్‌లో మన టీమ్‌తో కలసి పని చేద్దాం. ఈ లింక్ నొక్కండి:\n${url}`,
};

export default function InviteScreen() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: Exclude<keyof typeof L, "message">) => L[k][lang] ?? L[k].en;
  const { api } = useAuth();

  const units = useApi<OrgUnitNode[]>("/org/manageable");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<CreateInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Booth-level (leaf) units first — that's where workers are recruited.
  const sorted = useMemo(() => {
    const rows = units.data ?? [];
    const order: Record<string, number> = { booth: 0, mandal: 1, constituency: 2, district: 3, state: 4 };
    return [...rows].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  }, [units.data]);

  const selected = unitId ?? sorted[0]?.id ?? null;

  async function mint() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await api<CreateInviteResult>("/invites", {
        method: "POST",
        body: JSON.stringify({ orgUnitId: selected, role: "worker" }),
      });
      setInvite(res);
    } catch (e) {
      toast.error((e as Error).message ?? ll("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function sendWhatsApp() {
    if (!invite) return;
    const text = encodeURIComponent(L.message(invite.url));
    void Linking.openURL(
      Platform.OS === "web" ? `https://wa.me/?text=${text}` : `whatsapp://send?text=${text}`,
    ).catch(() => Linking.openURL(`https://wa.me/?text=${text}`));
  }

  async function shareSheet() {
    if (!invite) return;
    try {
      await Share.share({ message: L.message(invite.url) });
    } catch {
      await copyLink();
    }
  }

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: ll("title") }} />
      <Text style={st.intro}>{ll("intro")}</Text>

      <Text style={st.label}>{ll("unitLabel")}</Text>
      {units.loading ? (
        <SkeletonBlock height={44} rounded={radius.md} style={{ marginBottom: 14 }} />
      ) : (
        <View style={st.unitWrap}>
          {sorted.map((u) => {
            const active = u.id === selected;
            return (
              <Pressable
                key={u.id}
                onPress={() => {
                  setUnitId(u.id);
                  setInvite(null);
                }}
                style={[st.unitChip, active && st.unitChipActive]}
              >
                <Text style={[st.unitChipText, active && st.unitChipTextActive]} numberOfLines={1}>
                  {u.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!invite ? (
        <Pressable
          onPress={() => void mint()}
          disabled={busy || !selected}
          style={({ pressed }) => [st.primary, (pressed || busy) && { opacity: 0.85 }]}
        >
          <Feather name="link" size={16} color="#fff" />
          <Text style={st.primaryText}>{busy ? ll("minting") : ll("mint")}</Text>
        </Pressable>
      ) : (
        <View style={[st.linkCard, shadow]}>
          <Text style={st.linkLabel}>{ll("yourLink")}</Text>
          <Text selectable style={st.linkText}>
            {invite.url}
          </Text>

          <Pressable onPress={sendWhatsApp} style={({ pressed }) => [st.waBtn, pressed && { opacity: 0.85 }]}>
            <Feather name="message-circle" size={16} color="#fff" />
            <Text style={st.waBtnText}>{ll("whatsapp")}</Text>
          </Pressable>

          <View style={st.secondaryRow}>
            <Pressable onPress={() => void copyLink()} style={({ pressed }) => [st.secondaryBtn, pressed && { opacity: 0.8 }]}>
              <Feather name={copied ? "check" : "copy"} size={14} color={colors.primary} />
              <Text style={st.secondaryText}>{copied ? ll("copied") : ll("copy")}</Text>
            </Pressable>
            <Pressable onPress={() => void shareSheet()} style={({ pressed }) => [st.secondaryBtn, pressed && { opacity: 0.8 }]}>
              <Feather name="share-2" size={14} color={colors.primary} />
              <Text style={st.secondaryText}>{ll("share")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted },
  intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 18, fontFamily },
  label: { fontWeight: "700", color: colors.textMuted, marginBottom: 8, fontFamily },
  unitWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  unitChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  unitChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  unitChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13, fontFamily },
  unitChipTextActive: { color: colors.primary },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 52,
    ...shadow,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16, fontFamily, lineHeight: lh(16) },
  linkCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: 16 },
  linkLabel: { fontWeight: "700", color: colors.textMuted, fontSize: 12, marginBottom: 6, fontFamily },
  linkText: { color: colors.text, fontSize: 13, marginBottom: 14, fontFamily },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    borderRadius: radius.md,
    height: 48,
    marginBottom: 10,
  },
  waBtnText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily, lineHeight: lh(15) },
  secondaryRow: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    height: 42,
    backgroundColor: "#fff",
  },
  secondaryText: { color: colors.primary, fontWeight: "700", fontSize: 13, fontFamily },
});
