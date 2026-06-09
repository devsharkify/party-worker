import { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { toast } from "sonner-native";
import { useTranslation } from "react-i18next";
import type { ConsentState, MembershipCard, OrgMemberRow, ScoreSummary, SocialAccountInfo } from "@pw/shared";
import { ConsentPurpose } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { setLanguage } from "../../src/i18n";
import { PrimaryButton } from "../../src/components/ui";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { QrPayload } from "../../src/components/QrPayload";
import { Feather } from "@expo/vector-icons";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colors, radius, shadow, tierColor } from "../../src/theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];
const PLATFORM_ICON: Record<string, FeatherName> = {
  whatsapp: "message-circle",
  instagram: "instagram",
  facebook: "users",
  youtube: "play",
  x: "twitter",
  other: "link",
};

interface ReachByPlatform {
  platform: string;
  count: number;
}

interface MyAnalytics {
  totalShares: number;
  totalReach: number;
  totalPoints: number;
  bestCreative: { title: string; reach: number } | null;
  reachByPlatform: ReachByPlatform[];
}

// Approximate points thresholds per tier (for progress bar)
const TIER_MAX: Record<string, number> = {
  karyakarta: 500,
  sevak: 1000,
  pramukh: 2500,
  nayak: 5000,
  ratna: 10000,
};

const L = {
  scanHint: { te: "ధృవీకరణ కోసం స్కాన్ చేయండి", en: "Scan to verify membership" },
  social: { te: "సోషల్ ఖాతాలు", en: "Social accounts" },
};

const CONSENT_META: Record<
  ConsentPurpose,
  { label: string; description: string }
> = {
  data_processing: {
    label: "Data Processing",
    description: "Allow us to process your activity data",
  },
  social_linking: {
    label: "Social Account Linking",
    description: "Connect your Instagram/Facebook accounts",
  },
  content_resharing: {
    label: "Content Resharing",
    description: "Allow app to reshare your content",
  },
  location: {
    label: "Location Access",
    description: "Use location for events and grievances",
  },
};

export default function Profile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { logout, api, refreshUser } = useAuth();
  const card = useApi<MembershipCard>("/users/me/card");
  const summary = useApi<ScoreSummary>("/scoring/summary");
  const social = useApi<SocialAccountInfo[]>("/social");
  const reach = useApi<MyAnalytics>("/me/analytics");
  const consents = useApi<ConsentState[]>("/me/consents");
  const recruits = useApi<OrgMemberRow[]>("/me/recruits");
  const [busy, setBusy] = useState<string | undefined>();
  const [consentBusy, setConsentBusy] = useState<ConsentPurpose | undefined>();

  async function toggleConsent(purpose: ConsentPurpose, granted: boolean) {
    setConsentBusy(purpose);
    try {
      await api("/me/consents", {
        method: "POST",
        body: JSON.stringify({ purpose, granted }),
      });
      await consents.reload();
    } catch {
      toast.error("Failed to update consent. Please try again.");
    } finally {
      setConsentBusy(undefined);
    }
  }

  // Edit profile modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editLang, setEditLang] = useState<"te" | "en">("te");
  const [editError, setEditError] = useState<string | undefined>();

  function openEditModal() {
    const u = card.data;
    setEditName(u?.name ?? "");
    setEditDesignation(u?.designation ?? "");
    setEditLang((lang as "te" | "en") ?? "te");
    setEditError(undefined);
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    setBusy("edit");
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          designation: editDesignation.trim() || undefined,
          preferredLanguage: editLang,
        }),
      });
      await refreshUser();
      await card.reload();
      setEditOpen(false);
      toast.success("Profile updated");
    } catch (e: unknown) {
      setEditError((e as Error).message ?? "Failed to save.");
    } finally {
      setBusy(undefined);
    }
  }

  const ig = social.data?.find((s) => s.platform === "instagram");

  async function connectIg() {
    setBusy("ig");
    try {
      const result = await api<{ authorizeUrl?: string; mode?: string }>(
        "/social/instagram/connect",
        { method: "POST", body: JSON.stringify({ type: "creator" }) },
      );
      if (result?.authorizeUrl) {
        await Linking.openURL(result.authorizeUrl);
        return;
      }
      await api("/social/instagram/sync", { method: "POST" });
      await Promise.all([social.reload(), summary.reload(), refreshUser()]);
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnectIg() {
    setBusy("ig-disconnect");
    try {
      await api("/social/instagram/disconnect", { method: "POST" });
      await Promise.all([social.reload(), summary.reload(), refreshUser()]);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to disconnect Instagram.");
    } finally {
      setBusy(undefined);
    }
  }

  async function payMembership() {
    setBusy("pay");
    try {
      const order = await api<{ orderId: string; amountInr: number; status: string }>(
        "/payments/membership/start",
        { method: "POST", body: JSON.stringify({}) },
      );

      if (order.orderId.startsWith("mock_order_")) {
        await api("/payments/membership/verify", {
          method: "POST",
          body: JSON.stringify({ orderId: order.orderId }),
        });
        await Promise.all([card.reload(), refreshUser()]);
        return;
      }

      const razorpayUrl = `https://rzp.io/i/${order.orderId}`;
      const canOpen = await Linking.canOpenURL(razorpayUrl);
      if (canOpen) {
        await Linking.openURL(razorpayUrl);
      } else {
        toast.success(`Pay ₹${order.amountInr} at: ${razorpayUrl}`);
      }

      await api("/payments/membership/verify", {
        method: "POST",
        body: JSON.stringify({ orderId: order.orderId }),
      });
      await Promise.all([card.reload(), refreshUser()]);
    } finally {
      setBusy(undefined);
    }
  }

  const c = card.data;
  const sum = summary.data;
  const accent = c ? tierColor[c.tier] ?? colors.primary : colors.primary;
  const anyRefreshing = card.refreshing || summary.refreshing || social.refreshing;

  function refreshAll() {
    void Promise.all([card.refresh(), summary.refresh(), social.refresh(), reach.refresh(), consents.refresh(), recruits.refresh()]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.cardMuted }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={anyRefreshing}
          onRefresh={refreshAll}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ===== Membership card ===== */}
      {c ? (
        <View style={[st.memCard, shadow]}>
          {/* Pink top bar */}
          <View style={st.cardTopBar}>
            <View style={st.cardTopLeft}>
              <Text style={st.cardBrand}>★ myTRS</Text>
              <Text style={st.cardBrandSub}>Telangana Rashtra Samithi</Text>
            </View>
            <View style={[st.tierBadge, { backgroundColor: accent }]}>
              <Text style={st.tierBadgeText}>
                {lang === "te" ? c.tierLabel.te : c.tierLabel.en}
              </Text>
            </View>
          </View>

          {/* Member info */}
          <View style={st.memTop}>
            <View style={[st.photoRing, { borderColor: accent }]}>
              <RemoteImage uri={c.photoUrl} width={68} height={68} radius={34} placeholderColor={colors.primarySoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.memName} numberOfLines={1}>
                {c.name}
              </Text>
              {c.designation ? (
                <Text style={st.memSub} numberOfLines={1}>
                  {c.designation}
                </Text>
              ) : null}
              {c.boothName ? (
                <View style={st.boothRow}>
                  <Feather name="map-pin" size={12} color={colors.textMutedOnDark} />
                  <Text style={st.memSub} numberOfLines={1}>
                    {c.boothName}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* QR section */}
          <View style={st.qrSection}>
            <View style={st.qrBox}>
              <QrPayload value={c.qrPayload} size={120} color="#fff" />
            </View>
            <View style={st.qrMeta}>
              <Text style={st.scanHint}>{L.scanHint[lang as "te" | "en"] ?? L.scanHint.en}</Text>
              <View
                style={[
                  st.statusChip,
                  { backgroundColor: c.membershipActive ? "rgba(255,179,0,0.18)" : "rgba(239,68,68,0.14)" },
                ]}
              >
                <Text
                  style={[
                    st.statusText,
                    { color: c.membershipActive ? colors.gold : "#ef4444" },
                  ]}
                >
                  {c.membershipActive ? "● " + t("membership.paid") : "○ " + t("membership.fee")}
                </Text>
              </View>
              <Text style={st.memberId} numberOfLines={1}>
                ID: {c.userId?.slice(0, 12) ?? "—"}
              </Text>
            </View>
          </View>

          {/* Tier progress bar */}
          {sum ? <TierProgressBar sum={sum} accent={accent} /> : null}
        </View>
      ) : card.error ? (
        <View style={[st.memCard, shadow, { alignItems: "center", paddingVertical: 28 }]}>
          <Text style={st.cardErr}>{card.error}</Text>
          <Pressable onPress={card.reload} style={st.smallRetry}>
            <Text style={st.smallRetryText}>↻ {t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[st.memCard, { padding: 18 }]}>
          <SkeletonBlock width={140} height={18} dark />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16, alignItems: "center" }}>
            <SkeletonBlock width={68} height={68} rounded={34} dark />
            <View style={{ flex: 1 }}>
              <SkeletonBlock width="60%" height={18} dark />
              <SkeletonBlock width="40%" height={12} dark style={{ marginTop: 8 }} />
            </View>
          </View>
          <SkeletonBlock width={120} height={120} dark style={{ marginTop: 16 }} />
        </View>
      )}

      {/* ===== Edit profile button ===== */}
      <Pressable onPress={openEditModal} style={st.editProfileBtn}>
        <Feather name="edit-2" size={14} color={colors.primary} />
        <Text style={st.editProfileBtnText}>Edit Profile</Text>
      </Pressable>

      {/* ===== Edit profile modal ===== */}
      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={st.modalOverlay}
        >
          <View style={st.modalSheet}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Edit Profile</Text>
              <Pressable onPress={() => setEditOpen(false)} hitSlop={8}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={st.modalLabel}>Full Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#94a3b8"
              style={st.modalInput}
              returnKeyType="next"
            />

            <Text style={st.modalLabel}>Designation</Text>
            <TextInput
              value={editDesignation}
              onChangeText={setEditDesignation}
              placeholder="e.g. Area Secretary"
              placeholderTextColor="#94a3b8"
              style={st.modalInput}
              returnKeyType="done"
            />

            <Text style={st.modalLabel}>Preferred Language</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {(["te", "en"] as const).map((l) => (
                <Pressable
                  key={l}
                  onPress={() => setEditLang(l)}
                  style={[st.lang, editLang === l && st.langActive]}
                >
                  <Text style={[st.langText, editLang === l && { color: "#fff" }]}>
                    {l === "te" ? "తెలుగు" : "English"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {editError ? <Text style={st.modalError}>{editError}</Text> : null}

            <PrimaryButton
              title="Save"
              onPress={saveProfile}
              loading={busy === "edit"}
              disabled={!editName.trim()}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Score summary ===== */}
      {sum ? (
        <View style={st.section}>
          <Text style={st.sectionTitle}>My Score</Text>
          <View style={st.scoreRow}>
            <Stat label={t("profile.lifetimePoints")} value={sum.lifetimeReputation} />
            <Stat label={t("profile.weeklyPoints")} value={sum.weeklyLeaguePoints} accent />
          </View>
          {recruits.data != null ? (
            <View style={st.recruitRow}>
              <Text style={st.recruitText}>
                {"👥 Recruits brought in: " + recruits.data.length}
              </Text>
            </View>
          ) : null}
          <View style={st.ranks}>
            {(["booth", "mandal", "constituency", "district", "state"] as const).map((lv) =>
              sum.ranks[lv] ? (
                <View key={lv} style={st.rankChip}>
                  <Text style={st.rankChipLabel}>{t(`leaderboard.${lv}`)}</Text>
                  <Text style={st.rankChipVal}>#{sum.ranks[lv]}</Text>
                </View>
              ) : null,
            )}
          </View>
        </View>
      ) : null}

      {/* ===== Instagram ===== */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>{L.social[lang as "te" | "en"] ?? L.social.en}</Text>
        {ig?.connected ? (
          <View style={st.igConnectedBlock}>
            <View style={st.connectedRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="check" size={14} color={colors.success} />
                <Text style={st.connected}>{t("profile.connected")}</Text>
              </View>
              {ig.handle ? <Text style={st.handle}>@{ig.handle}</Text> : null}
            </View>
            <Pressable
              onPress={disconnectIg}
              style={[st.disconnectBtn, busy === "ig-disconnect" && { opacity: 0.5 }]}
              disabled={busy === "ig-disconnect"}
            >
              <Feather name="x" size={13} color={colors.danger} />
              <Text style={st.disconnectBtnText}>Disconnect</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={st.note}>{t("profile.basePointsOnly")}</Text>
            <PrimaryButton
              title={t("profile.connectInstagram")}
              onPress={connectIg}
              loading={busy === "ig"}
            />
          </>
        )}
      </View>

      {/* ===== Membership CTA ===== */}
      {c ? (
        <View style={st.section}>
          <View style={st.memCtaHeader}>
            <Text style={st.sectionTitle}>{t("membership.title")}</Text>
            {c.membershipActive ? (
              <View style={st.activeBadge}>
                <Feather name="check-circle" size={12} color="#16a34a" />
                <Text style={st.activeBadgeText}>Active</Text>
              </View>
            ) : (
              <View style={st.inactiveBadge}>
                <Text style={st.inactiveBadgeText}>Not Active</Text>
              </View>
            )}
          </View>
          {!c.membershipActive ? (
            <>
              <Text style={st.note}>{t("membership.fee")}</Text>
              <PrimaryButton
                title={t("membership.pay")}
                onPress={payMembership}
                loading={busy === "pay"}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {/* ===== Language ===== */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>{t("common.language")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["te", "en"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLanguage(l)}
              style={[st.lang, lang === l && st.langActive]}
            >
              <Text style={[st.langText, lang === l && { color: "#fff" }]}>
                {l === "te" ? "తెలుగు" : "English"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ===== My Reach ===== */}
      <MyReachCard reachData={reach.data} loading={reach.loading} />

      {/* ===== Privacy & Consent ===== */}
      <PrivacyConsentSection
        consents={consents.data}
        loading={consents.loading}
        consentBusy={consentBusy}
        onToggle={toggleConsent}
      />

      <Pressable onPress={logout} style={st.logout}>
        <Feather name="log-out" size={16} color={colors.danger} />
        <Text style={st.logoutText}>{t("common.logout")}</Text>
      </Pressable>
    </ScrollView>
  );
}

function TierProgressBar({ sum, accent }: { sum: ScoreSummary; accent: string }) {
  const tier = sum.tier ?? "karyakarta";
  const maxPts = TIER_MAX[tier] ?? 1000;
  const progress = Math.min(sum.lifetimeReputation / maxPts, 1);
  const pct = Math.round(progress * 100);

  return (
    <View style={st.progressWrap}>
      <View style={st.progressLabelRow}>
        <Text style={st.progressLabel}>
          Tier: <Text style={[st.progressTierName, { color: accent }]}>{tier}</Text>
        </Text>
        {sum.nextTier ? (
          <Text style={st.progressNext}>
            {sum.pointsToNextTier} pts to {sum.nextTier}
          </Text>
        ) : (
          <Text style={st.progressNext}>Max tier reached!</Text>
        )}
      </View>
      <View style={st.progressTrack}>
        <View
          style={[
            st.progressFill,
            { width: `${pct}%` as never, backgroundColor: accent },
          ]}
        />
      </View>
    </View>
  );
}

function MyReachCard({
  reachData,
  loading,
}: {
  reachData: MyAnalytics | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={st.section}>
        <SkeletonBlock width={120} height={16} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SkeletonBlock width="45%" height={56} rounded={8} />
          <SkeletonBlock width="45%" height={56} rounded={8} />
        </View>
        <SkeletonBlock width="70%" height={14} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!reachData) return null;

  const totalShares = reachData.totalShares ?? 0;
  const totalReach = reachData.totalReach ?? 0;
  const platforms = reachData.reachByPlatform ?? [];

  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>My Reach</Text>

      <View style={st.scoreRow}>
        <View style={st.stat}>
          <Text style={st.statValue}>{totalShares.toLocaleString()}</Text>
          <Text style={st.statLabel}>Total Shares</Text>
        </View>
        <View style={[st.stat, { backgroundColor: colors.primarySoft, borderColor: colors.primary + "33" }]}>
          <Text style={[st.statValue, { color: colors.primaryDark }]}>
            {totalReach.toLocaleString()}
          </Text>
          <Text style={st.statLabel}>Total Reach</Text>
        </View>
      </View>

      {reachData.bestCreative ? (
        <View style={st.reachBestCard}>
          <Text style={st.reachBestLabel}>Top Creative</Text>
          <Text style={st.reachBestTitle} numberOfLines={2}>{reachData.bestCreative.title}</Text>
          <Text style={st.reachBestReach}>{(reachData.bestCreative.reach ?? 0).toLocaleString()} reach</Text>
        </View>
      ) : null}

      {platforms.length > 0 ? (
        <View style={st.platformRow}>
          {platforms.map((p) => (
            <View key={p.platform} style={[st.platformChip, { flexDirection: "row", alignItems: "center", gap: 5 }]}>
              <Feather name={PLATFORM_ICON[p.platform] ?? "link"} size={13} color={colors.textMuted} />
              <Text style={st.platformChipText}>
                {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}{" "}
                {(p.count ?? 0).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PrivacyConsentSection({
  consents,
  loading,
  consentBusy,
  onToggle,
}: {
  consents: ConsentState[] | null;
  loading: boolean;
  consentBusy: ConsentPurpose | undefined;
  onToggle: (purpose: ConsentPurpose, granted: boolean) => void;
}) {
  const purposes = ConsentPurpose.options;

  return (
    <View style={st.section}>
      <View style={st.consentHeader}>
        <Feather name="shield" size={16} color={colors.primary} />
        <Text style={[st.sectionTitle, { marginBottom: 0, marginLeft: 6 }]}>
          Privacy &amp; Consent
        </Text>
      </View>
      <Text style={[st.note, { marginTop: 8 }]}>
        Manage how your data is used under India&apos;s DPDP Act.
      </Text>

      {loading ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <SkeletonBlock width="100%" height={56} rounded={12} />
          <SkeletonBlock width="100%" height={56} rounded={12} />
          <SkeletonBlock width="100%" height={56} rounded={12} />
          <SkeletonBlock width="100%" height={56} rounded={12} />
        </View>
      ) : (
        <View style={{ gap: 0 }}>
          {purposes.map((purpose, idx) => {
            const meta = CONSENT_META[purpose];
            const state = consents?.find((c) => c.purpose === purpose);
            const granted = state?.granted ?? false;
            const grantedAt = state?.grantedAt;
            const isBusy = consentBusy === purpose;
            const isLast = idx === purposes.length - 1;

            return (
              <View
                key={purpose}
                style={[st.consentRow, !isLast && st.consentRowBorder]}
              >
                <View style={st.consentText}>
                  <Text style={st.consentLabel}>{meta.label}</Text>
                  <Text style={st.consentDesc}>{meta.description}</Text>
                  {grantedAt ? (
                    <Text style={st.consentUpdated}>
                      Last updated:{" "}
                      {new Date(grantedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={granted}
                  onValueChange={(val) => onToggle(purpose, val)}
                  disabled={isBusy}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                  thumbColor={granted ? colors.primary : "#f4f4f4"}
                  ios_backgroundColor={colors.border}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[
      st.stat,
      accent && { backgroundColor: colors.primarySoft, borderColor: colors.primary + "33" },
    ]}>
      <Text style={[st.statValue, accent && { color: colors.primaryDark }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  // Membership card — dark navy with pink accents
  memCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  cardTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardTopLeft: { flex: 1 },
  cardBrand: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  cardBrandSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tierBadgeText: { color: "#1a1a2e", fontWeight: "900", fontSize: 12 },
  memTop: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  photoRing: { borderRadius: 38, borderWidth: 2.5, padding: 2 },
  memName: { color: "#fff", fontSize: 20, fontWeight: "800" },
  memSub: { color: colors.textMutedOnDark, fontSize: 13, marginTop: 1 },
  boothRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  qrSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  qrBox: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  qrMeta: { flex: 1, gap: 10 },
  scanHint: { color: colors.textMutedOnDark, fontSize: 12, lineHeight: 18 },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: { fontWeight: "800", fontSize: 13 },
  memberId: { color: colors.borderOnDark, fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  cardErr: { color: colors.textMutedOnDark, textAlign: "center", marginBottom: 12 },
  smallRetry: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  smallRetryText: { color: "#fff", fontWeight: "800" },

  // Tier progress bar
  progressWrap: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 4,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabel: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: "600" },
  progressTierName: { fontWeight: "800", textTransform: "capitalize" },
  progressNext: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: "600" },
  progressTrack: {
    height: 6,
    backgroundColor: colors.borderOnDark,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: radius.pill,
  },

  section: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  sectionTitle: { fontWeight: "800", color: colors.text, marginBottom: 12, fontSize: 16 },
  scoreRow: { flexDirection: "row", gap: 12 },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: "center" },
  ranks: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  rankChip: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankChipLabel: { fontSize: 11, color: colors.textMuted },
  rankChipVal: { fontSize: 15, fontWeight: "800", color: colors.navy },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  connected: { color: colors.success, fontWeight: "800" },
  handle: { color: colors.textMuted, fontWeight: "600" },
  note: { color: colors.textMuted, marginBottom: 12, lineHeight: 20 },
  lang: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  langActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontWeight: "700", color: colors.text },
  memCtaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(22,163,74,0.12)",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  activeBadgeText: { color: "#16a34a", fontWeight: "800", fontSize: 12 },
  inactiveBadge: {
    backgroundColor: "rgba(156,163,175,0.16)",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inactiveBadgeText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  logout: {
    marginTop: 20,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
  },
  logoutText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
  reachBestCard: {
    marginTop: 12,
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reachBestLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  reachBestTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  reachBestReach: { fontSize: 13, fontWeight: "600", color: colors.primaryDark, marginTop: 3 },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  platformChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  platformChipText: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },

  // Recruit count row
  recruitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: colors.cardMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recruitText: { fontSize: 14, fontWeight: "700", color: colors.text },

  // Instagram disconnect
  igConnectedBlock: { gap: 10 },
  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.danger + "44",
  },
  disconnectBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },

  // Edit profile
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
  },
  editProfileBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalLabel: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  modalError: { color: colors.danger, fontSize: 13, marginBottom: 12, fontWeight: "600" },

  // Privacy & Consent section
  consentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  consentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  consentText: {
    flex: 1,
    gap: 2,
  },
  consentLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  consentDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  consentUpdated: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 2,
  },
});
