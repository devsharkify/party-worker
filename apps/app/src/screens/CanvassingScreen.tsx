import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../auth/auth-context";
import { useApi } from "../hooks";
import { colors, fontFamily, lh, radius, shadow, shadowLg } from "../theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Sentiment = "positive" | "neutral" | "negative" | "undecided";

interface VoterContact {
  id: string;
  voterName: string;
  address: string;
  sentiment: Sentiment;
  issue?: string;
  notes?: string;
  createdAt: string;
}

interface CreateVoterContactDto {
  voterName: string;
  address: string;
  sentiment: Sentiment;
  issue?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAVY = "#1A3580";
const GOLD = "#E8A820";
const TODAY_KEY = "canvassing_today_count";
const TODAY_DATE_KEY = "canvassing_today_date";

const SENTIMENT_OPTIONS: {
  value: Sentiment;
  label: string;
  emoji: string;
  color: string;
  bg: string;
}[] = [
  { value: "positive", label: "Positive", emoji: "✅", color: "#166534", bg: "#dcfce7" },
  { value: "neutral", label: "Neutral", emoji: "😐", color: "#713f12", bg: "#fef9c3" },
  { value: "negative", label: "Negative", emoji: "❌", color: "#991b1b", bg: "#fee2e2" },
  { value: "undecided", label: "Undecided", emoji: "❓", color: "#1e3a5f", bg: "#dbeafe" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTodayCount(): Promise<number> {
  try {
    const today = new Date().toDateString();
    const storedDate = await AsyncStorage.getItem(TODAY_DATE_KEY);
    if (storedDate !== today) {
      await AsyncStorage.setItem(TODAY_DATE_KEY, today);
      await AsyncStorage.setItem(TODAY_KEY, "0");
      return 0;
    }
    const val = await AsyncStorage.getItem(TODAY_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function incrementTodayCount(): Promise<number> {
  try {
    const today = new Date().toDateString();
    await AsyncStorage.setItem(TODAY_DATE_KEY, today);
    const existing = await AsyncStorage.getItem(TODAY_KEY);
    const next = (existing ? parseInt(existing, 10) : 0) + 1;
    await AsyncStorage.setItem(TODAY_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CounterBadge({ count }: { count: number }) {
  return (
    <View style={badge.wrap}>
      <View style={badge.iconCircle}>
        <Feather name="users" size={20} color={GOLD} />
      </View>
      <View style={badge.textBlock}>
        <Text style={badge.number}>{count}</Text>
        <Text style={badge.label}>contacts logged today</Text>
      </View>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    gap: 14,
    ...shadowLg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: NAVY + "CC",
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1 },
  number: {
    fontSize: 32,
    fontWeight: "900",
    color: GOLD,
    fontFamily,
    lineHeight: lh(32),
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B8C2DA",
    fontFamily,
    lineHeight: lh(12),
    marginTop: 2,
  },
});

function SentimentPicker({
  value,
  onChange,
}: {
  value: Sentiment;
  onChange: (s: Sentiment) => void;
}) {
  return (
    <View style={sp.grid}>
      {SENTIMENT_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              sp.btn,
              active && { backgroundColor: opt.bg, borderColor: opt.color, borderWidth: 2 },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={sp.emoji}>{opt.emoji}</Text>
            <Text style={[sp.label, active && { color: opt.color, fontWeight: "800" }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const sp = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    flex: 1,
    minWidth: "44%",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: { fontSize: 22, lineHeight: 28 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(13),
  },
});

function ContactCard({ contact }: { contact: VoterContact }) {
  const sentimentOpt = SENTIMENT_OPTIONS.find((o) => o.value === contact.sentiment);
  return (
    <View style={cc.card}>
      <View style={cc.row}>
        <View style={cc.nameBlock}>
          <Text style={cc.name} numberOfLines={1}>
            {contact.voterName}
          </Text>
          {contact.address ? (
            <Text style={cc.addr} numberOfLines={1}>
              {contact.address}
            </Text>
          ) : null}
        </View>
        {sentimentOpt ? (
          <View style={[cc.badge, { backgroundColor: sentimentOpt.bg }]}>
            <Text style={cc.badgeEmoji}>{sentimentOpt.emoji}</Text>
            <Text style={[cc.badgeLabel, { color: sentimentOpt.color }]}>
              {sentimentOpt.label}
            </Text>
          </View>
        ) : null}
      </View>
      {contact.issue ? (
        <View style={cc.issueRow}>
          <Feather name="alert-circle" size={11} color={colors.textMuted} />
          <Text style={cc.issue}>{contact.issue}</Text>
        </View>
      ) : null}
      {contact.notes ? <Text style={cc.notes}>{contact.notes}</Text> : null}
      <Text style={cc.time}>{formatTime(contact.createdAt)}</Text>
    </View>
  );
}

const cc = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: NAVY,
    ...shadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  nameBlock: { flex: 1 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    fontFamily,
    lineHeight: lh(15),
  },
  addr: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(12),
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  badgeEmoji: { fontSize: 12, lineHeight: 16 },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily,
    lineHeight: lh(11),
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  issue: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(12),
    flex: 1,
  },
  notes: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(12),
    marginTop: 4,
    fontStyle: "italic",
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(11),
    marginTop: 6,
    textAlign: "right",
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CanvassingScreen() {
  const { api } = useAuth();
  const recent = useApi<VoterContact[]>("/voter-contacts/mine");

  // Form state
  const [voterName, setVoterName] = useState("");
  const [address, setAddress] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment>("positive");
  const [issue, setIssue] = useState("");
  const [notes, setNotes] = useState("");

  // UI state
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  // Load today's count from AsyncStorage on mount
  useEffect(() => {
    void getTodayCount().then(setTodayCount);
  }, []);

  const resetForm = useCallback(() => {
    setVoterName("");
    setAddress("");
    setSentiment("positive");
    setIssue("");
    setNotes("");
    setError(null);
  }, []);

  async function handleSubmit() {
    if (!voterName.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSubmitted(false);

    const body: CreateVoterContactDto = {
      voterName: voterName.trim(),
      address: address.trim(),
      sentiment,
      issue: issue.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      await api<VoterContact>("/voter-contacts", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const newCount = await incrementTodayCount();
      setTodayCount(newCount);
      setSubmitted(true);
      resetForm();
      recent.reload();
    } catch (e) {
      setError((e as Error).message ?? "Failed to save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = voterName.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.cardMuted }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={st.header}>
          <View style={st.headerTextBlock}>
            <Text style={st.headerTitle}>Canvassing</Text>
            <Text style={st.headerSubtitle}>Log voter contacts in your area</Text>
          </View>
          <View style={st.headerIcon}>
            <Feather name="map-pin" size={24} color={GOLD} />
          </View>
        </View>

        {/* Today counter */}
        <CounterBadge count={todayCount} />

        {/* Form card */}
        <View style={st.card}>
          <Text style={st.sectionTitle}>New Contact</Text>

          {/* Success banner */}
          {submitted ? (
            <View style={st.successBanner}>
              <Feather name="check-circle" size={16} color="#166534" />
              <Text style={st.successText}>Contact logged successfully!</Text>
            </View>
          ) : null}

          {/* Error banner */}
          {error ? (
            <View style={st.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.danger} />
              <Text style={st.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Voter name */}
          <Text style={st.label}>Voter Name *</Text>
          <TextInput
            style={st.input}
            value={voterName}
            onChangeText={setVoterName}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
          />

          {/* Address */}
          <Text style={st.label}>Address</Text>
          <TextInput
            style={st.input}
            value={address}
            onChangeText={setAddress}
            placeholder="House no, street, area"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
          />

          {/* Sentiment */}
          <Text style={st.label}>Voter Sentiment</Text>
          <SentimentPicker value={sentiment} onChange={setSentiment} />

          {/* Issue */}
          <Text style={st.label}>Issue Raised (optional)</Text>
          <TextInput
            style={st.input}
            value={issue}
            onChangeText={setIssue}
            placeholder="e.g. Water supply, road repair..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
          />

          {/* Notes */}
          <Text style={st.label}>Notes (optional)</Text>
          <TextInput
            style={[st.input, st.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional observations"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />

          {/* Submit */}
          <Pressable
            onPress={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            style={({ pressed }) => [
              st.submitBtn,
              !canSubmit && st.submitDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={st.submitInner}>
                <Feather name="plus-circle" size={18} color="#fff" />
                <Text style={st.submitText}>Log Contact</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Recent contacts */}
        <View style={st.recentHeader}>
          <Text style={st.sectionTitle}>Recent Contacts</Text>
          {recent.data && recent.data.length > 0 ? (
            <Text style={st.recentCount}>{recent.data.length} total</Text>
          ) : null}
        </View>

        {recent.loading && !recent.data ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator color={NAVY} />
            <Text style={st.loadingText}>Loading contacts...</Text>
          </View>
        ) : null}

        {recent.data && recent.data.length === 0 ? (
          <View style={st.emptyWrap}>
            <Feather name="clipboard" size={32} color={colors.textMuted} />
            <Text style={st.emptyText}>No contacts logged yet.</Text>
            <Text style={st.emptyHint}>Use the form above to log your first voter contact.</Text>
          </View>
        ) : null}

        {(recent.data ?? []).slice(0, 5).map((contact) => (
          <ContactCard key={contact.id} contact={contact} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTextBlock: { flex: 1 },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: NAVY,
    fontFamily,
    lineHeight: lh(26),
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(13),
    marginTop: 2,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    fontFamily,
    lineHeight: lh(17),
    marginBottom: 14,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  successText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#166534",
    fontFamily,
    lineHeight: lh(14),
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fee2e2",
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
    fontFamily,
    lineHeight: lh(13),
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    fontFamily,
    lineHeight: lh(13),
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    fontFamily,
  },
  multiline: {
    minHeight: 80,
  },
  submitBtn: {
    marginTop: 20,
    backgroundColor: NAVY,
    borderRadius: radius.md,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    ...shadowLg,
  },
  submitDisabled: {
    backgroundColor: "#9AA3B8",
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    fontFamily,
    lineHeight: lh(16),
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  recentCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(12),
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 20,
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(14),
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(15),
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily,
    lineHeight: lh(13),
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
