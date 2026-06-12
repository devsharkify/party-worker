import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { toast } from "sonner-native";
import { useAuth } from "../src/auth/auth-context";
import { colors, fontFamily, lh, radius, shadow } from "../src/theme";

const L = {
  title: { te: "కంటెంట్ పంపండి", en: "Submit content" },
  intro: {
    te: "మీ ప్రాంతంలో తీసిన ఫోటో/వీడియో పంపండి. ఆమోదం తర్వాత అందరి ఫీడ్‌లో కనిపిస్తుంది.",
    en: "Send a photo/video from your area. It appears in everyone's feed after approval.",
  },
  pick: { te: "ఫోటో / వీడియో ఎంచుకోండి", en: "Pick a photo / video" },
  changeMedia: { te: "మార్చండి", en: "Change" },
  titleLabel: { te: "శీర్షిక", en: "Title" },
  titlePh: { te: "ఉదా: మా వార్డ్‌లో రోడ్డు సమస్య", en: "e.g. Road issue in our ward" },
  captionLabel: { te: "క్యాప్షన్ (ఐచ్ఛికం)", en: "Caption (optional)" },
  captionPh: { te: "షేర్ చేసేటప్పుడు కనిపించే సందేశం", en: "Message shown when shared" },
  submit: { te: "సమీక్షకు పంపండి", en: "Send for review" },
  submitting: { te: "పంపుతోంది…", en: "Submitting…" },
  uploaded: { te: "పంపబడింది! ఆమోదం కోసం వేచి ఉండండి", en: "Submitted! Awaiting approval" },
  failed: { te: "పంపడం విఫలమైంది", en: "Submission failed" },
  needMedia: { te: "ముందుగా ఫోటో/వీడియో ఎంచుకోండి", en: "Pick a photo/video first" },
  needTitle: { te: "శీర్షిక రాయండి", en: "Add a title" },
  note: {
    te: "గమనిక: నాయకుడు / HQ ఆమోదించిన తర్వాతే ఫీడ్‌లో కనిపిస్తుంది.",
    en: "Note: appears in the feed only after leader/HQ approval.",
  },
  mySubs: { te: "నా సమర్పణలు చూడండి", en: "View my submissions" },
};

interface Picked {
  /** Local uri (native) or object URL (web) for preview. */
  previewUri: string;
  kind: "image" | "video";
  /** Web File object, or native {uri,name,type} descriptor for FormData. */
  file: File | { uri: string; name: string; type: string };
  durationSec?: number;
}

export default function SubmitContentScreen() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as "te" | "en") ?? "te";
  const ll = (k: keyof typeof L) => L[k][lang] ?? L[k].en;
  const { api } = useAuth();
  const router = useRouter();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  function pickWeb() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setPicked({
        previewUri: URL.createObjectURL(file),
        kind: file.type.startsWith("video/") ? "video" : "image",
        file,
      });
    };
    input.click();
  }

  async function pickNative() {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.9,
      });
      const asset = res.assets?.[0];
      if (res.canceled || !asset) return;
      const kind = asset.type === "video" ? "video" : "image";
      const ext = kind === "video" ? "mp4" : "jpg";
      setPicked({
        previewUri: asset.uri,
        kind,
        file: {
          uri: asset.uri,
          name: asset.fileName ?? `submission.${ext}`,
          type: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
        },
        durationSec: asset.duration ? Math.max(1, Math.round(asset.duration / 1000)) : undefined,
      });
    } catch {
      /* picker unavailable (e.g. simulator) — nothing to do */
    }
  }

  async function submit() {
    if (busy) return;
    if (!picked) {
      toast.error(ll("needMedia"));
      return;
    }
    if (!title.trim()) {
      toast.error(ll("needTitle"));
      return;
    }
    setBusy(true);
    try {
      // 1) upload the media file
      const fd = new FormData();
      fd.append("file", picked.file as Blob);
      const up = await api<{ key: string }>("/creatives/upload", {
        method: "POST",
        body: fd,
        // Don't set Content-Type — the runtime sets the multipart boundary.
        headers: {},
      });
      // 2) create the pending submission
      const cap = caption.trim();
      await api("/creatives/submit", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          type: picked.kind,
          sourceKey: up.key,
          captionVariants: { te: cap, en: cap },
          ...(picked.kind === "video" && picked.durationSec
            ? { videoDurationSec: picked.durationSec }
            : {}),
        }),
      });
      toast.success(ll("uploaded"));
      router.replace("/my-submissions");
    } catch (e) {
      toast.error((e as Error).message ?? ll("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: ll("title") }} />
      <Text style={st.intro}>{ll("intro")}</Text>

      {/* Media picker / preview */}
      {picked ? (
        <View style={st.previewWrap}>
          <Image source={{ uri: picked.previewUri }} style={st.preview} contentFit="cover" />
          {picked.kind === "video" ? (
            <View style={st.playBadge}>
              <Feather name="play" size={16} color="#fff" />
            </View>
          ) : null}
          <Pressable
            onPress={() => (Platform.OS === "web" ? pickWeb() : void pickNative())}
            style={st.changeBtn}
          >
            <Feather name="refresh-cw" size={13} color={colors.primary} />
            <Text style={st.changeBtnText}>{ll("changeMedia")}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => (Platform.OS === "web" ? pickWeb() : void pickNative())}
          style={({ pressed }) => [st.pickBox, pressed && { opacity: 0.85 }]}
        >
          <Feather name="upload" size={28} color={colors.primary} />
          <Text style={st.pickText}>{ll("pick")}</Text>
        </Pressable>
      )}

      <Text style={st.label}>{ll("titleLabel")}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={ll("titlePh")}
        placeholderTextColor="#94a3b8"
        style={st.input}
      />

      <Text style={st.label}>{ll("captionLabel")}</Text>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder={ll("captionPh")}
        placeholderTextColor="#94a3b8"
        style={[st.input, { height: 80, textAlignVertical: "top" }]}
        multiline
      />

      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        style={({ pressed }) => [st.primary, (pressed || busy) && { opacity: 0.85 }]}
      >
        <Text style={st.primaryText}>{busy ? ll("submitting") : ll("submit")}</Text>
      </Pressable>
      <Text style={st.note}>{ll("note")}</Text>

      <Pressable onPress={() => router.push("/my-submissions")} style={st.linkRow}>
        <Feather name="list" size={14} color={colors.primary} />
        <Text style={st.linkText}>{ll("mySubs")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cardMuted },
  intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16, fontFamily },
  pickBox: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 36,
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  pickText: { color: colors.primary, fontWeight: "700", fontSize: 15, fontFamily, lineHeight: lh(15) },
  previewWrap: { marginBottom: 16, borderRadius: radius.lg, overflow: "hidden", ...shadow },
  preview: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bg },
  playBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  changeBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeBtnText: { color: colors.primary, fontWeight: "700", fontSize: 12, fontFamily },
  label: { fontWeight: "700", color: colors.textMuted, marginBottom: 6, fontFamily },
  input: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
    fontFamily,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    ...shadow,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16, fontFamily, lineHeight: lh(16) },
  note: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 10, lineHeight: 17, fontFamily },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14, fontFamily },
});
