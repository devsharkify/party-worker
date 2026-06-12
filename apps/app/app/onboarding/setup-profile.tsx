import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/auth-context";
import { setLanguage } from "../../src/i18n";
import { PrimaryButton } from "../../src/components/ui";
import { CONSTITUENCY_NAMES, TELANGANA_CONSTITUENCIES } from "../../src/data/telangana";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../../src/theme";

// ── Reusable picker sheet ────────────────────────────────────────────────────

function PickerModal({
  visible,
  title,
  items,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: string[];
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  // Reset search each time the modal is dismissed
  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const filtered = query.trim()
    ? items.filter((i) => i.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={pm.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Tap outside the sheet to dismiss */}
        <Pressable style={pm.backdropDismiss} onPress={onClose} />
        <View style={pm.sheet}>
          <View style={pm.header}>
            <Text style={pm.title}>{title}</Text>
            <Pressable onPress={onClose} style={pm.closeBtn}>
              <Text style={pm.closeText}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor="#94a3b8"
            style={pm.search}
            autoFocus
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtered.map((item) => (
              <TouchableOpacity
                key={item}
                style={pm.item}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={pm.itemText}>{item}</Text>
              </TouchableOpacity>
            ))}
            {filtered.length === 0 && (
              <Text style={pm.empty}>No results</Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SetupProfile() {
  const { t, i18n } = useTranslation();
  const { user, api, setUser } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [constituency, setConstituency] = useState(user?.constituency ?? "");
  const [area, setArea] = useState(user?.area ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [showConstituencyPicker, setShowConstituencyPicker] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const areas = constituency ? (TELANGANA_CONSTITUENCIES[constituency] ?? []) : [];

  async function onContinue() {
    setError(undefined);
    setBusy(true);
    try {
      const updated = await api<{ name: string; constituency: string | null; area: string | null; preferredLanguage: string }>(
        "/users/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            preferredLanguage: i18n.language,
            ...(constituency ? { constituency } : {}),
            ...(area ? { area } : {}),
          }),
        },
      );
      if (user) {
        setUser({ ...user, ...updated } as typeof user);
      }
      router.push("./consent");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canContinue = name.trim().length >= 2 && constituency.length > 0 && area.length > 0;

  return (
    <SafeAreaView style={st.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <Text style={st.titleTe}>{t("onboarding.setupProfileTitleTe")}</Text>
          <Text style={st.titleEn}>{t("onboarding.setupProfileTitle")}</Text>

          <View style={st.card}>
            {/* Language toggle */}
            <Text style={st.label}>{t("onboarding.languageLabel")}</Text>
            <View style={st.langRow}>
              {(["te", "en"] as const).map((l) => (
                <Pressable
                  key={l}
                  onPress={() => setLanguage(l)}
                  style={({ pressed }) => [
                    st.lang,
                    i18n.language === l && st.langActive,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[st.langText, i18n.language === l && st.langTextActive]}>
                    {l === "te" ? "తెలుగు" : "English"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Name */}
            <Text style={[st.label, { marginTop: 20 }]}>{t("onboarding.nameLabel")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("onboarding.namePlaceholder")}
              placeholderTextColor="#94a3b8"
              style={st.input}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Constituency */}
            <Text style={[st.label, { marginTop: 4 }]}>{t("onboarding.constituencyLabel")}</Text>
            <Pressable
              style={({ pressed }) => [st.select, pressed && { opacity: 0.75 }]}
              onPress={() => setShowConstituencyPicker(true)}
            >
              <Text style={constituency ? st.selectValue : st.selectPlaceholder}>
                {constituency || t("onboarding.constituencyPlaceholder")}
              </Text>
              <Text style={st.chevron}>▾</Text>
            </Pressable>

            {/* Area */}
            <Text style={[st.label, { marginTop: 16 }]}>{t("onboarding.areaLabel")}</Text>
            <Pressable
              style={({ pressed }) => [
                st.select,
                !constituency && { opacity: 0.5 },
                pressed && constituency && { opacity: 0.75 },
              ]}
              onPress={() => constituency && setShowAreaPicker(true)}
            >
              <Text style={area ? st.selectValue : st.selectPlaceholder}>
                {area || t("onboarding.areaPlaceholder")}
              </Text>
              <Text style={st.chevron}>▾</Text>
            </Pressable>

            {error ? <Text style={st.error}>{error}</Text> : null}

            <PrimaryButton
              title={t("onboarding.continueBtn")}
              onPress={onContinue}
              loading={busy}
              disabled={!canContinue}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal
        visible={showConstituencyPicker}
        title={t("onboarding.constituencyLabel")}
        items={CONSTITUENCY_NAMES}
        onSelect={(v) => {
          setConstituency(v);
          setArea(""); // reset area when constituency changes
        }}
        onClose={() => setShowConstituencyPicker(false)}
      />

      <PickerModal
        visible={showAreaPicker}
        title={t("onboarding.areaLabel")}
        items={areas}
        onSelect={setArea}
        onClose={() => setShowAreaPicker(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  titleTe: {
    fontSize: 28,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
    fontFamily,
    lineHeight: lh(28),
  },
  titleEn: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 28,
    fontFamily,
    lineHeight: lh(16),
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 22,
    ...shadow,
    shadowColor: "#000",
    shadowOpacity: 0.25,
  },
  label: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: 8,
    fontFamily,
    lineHeight: lh(14),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: "#fff",
    fontFamily,
  },
  select: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    backgroundColor: "#fff",
  },
  selectValue: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
    fontFamily,
  },
  selectPlaceholder: {
    fontSize: 16,
    color: "#94a3b8",
    flex: 1,
    fontFamily,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 18,
    marginLeft: 8,
  },
  langRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  lang: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.textMuted, fontWeight: fontWeight.semibold, fontFamily },
  langTextActive: { color: "#fff", fontFamily },
  error: {
    color: colors.danger,
    marginBottom: 14,
    textAlign: "center",
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginTop: 12,
  },
});

const pm = StyleSheet.create({
  kav: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "80%",
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.text,
    fontFamily,
  },
  closeBtn: { padding: 6 },
  closeText: { fontSize: 18, color: colors.textMuted },
  search: {
    margin: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
    color: colors.text,
    fontFamily,
  },
  item: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemText: {
    fontSize: 16,
    color: colors.text,
    fontFamily,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    padding: 24,
    fontFamily,
  },
});
