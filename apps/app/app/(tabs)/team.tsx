import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { OrgMemberRow, OnboardResult, OrgUnitNode, Role, Tier } from "@pw/shared";
import { ORG_TYPE_LABEL, assignableRoles, roleFitsUnit } from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { Card, PrimaryButton } from "../../src/components/ui";
import { RemoteImage } from "../../src/components/RemoteImage";
import { RowSkeleton } from "../../src/components/Skeleton";
import { StateView } from "../../src/components/StateView";
import { Feather } from "@expo/vector-icons";
import { colors, fontFamily, lh, radius, shadow, tierColor } from "../../src/theme";

type Lang = "te" | "en";
type Loc = Record<string, { te: string; en: string }>;

const L: Loc = {
  title: { te: "నా బృందం", en: "My Team" },
  rosterTitle: { te: "మీ కార్యకర్తలు", en: "Your workers" },
  unitLabel: { te: "యూనిట్", en: "Unit" },
  errorTitle: { te: "బృందం లోడ్ కాలేదు", en: "Couldn’t load your team" },
  emptyTitle: { te: "ఇంకా సభ్యులు లేరు", en: "No members yet" },
  emptyMsg: {
    te: "కింద ఫారమ్‌తో మీ మొదటి కార్యకర్తను చేర్చండి.",
    en: "Onboard your first member with the form below.",
  },
  onboardTitle: { te: "కార్యకర్తను చేర్చండి", en: "Onboard a member" },
  name: { te: "పేరు", en: "Name" },
  phone: { te: "ఫోన్ నంబర్", en: "Phone number" },
  role: { te: "పాత్ర", en: "Role" },
  unitPick: { te: "ఏ యూనిట్‌లో", en: "Into which unit" },
  designation: { te: "హోదా (ఐచ్ఛికం)", en: "Designation (optional)" },
  submit: { te: "చేర్చండి", en: "Onboard" },
  pointsAwarded: { te: "పాయింట్లు లభించాయి", en: "points earned" },
  added: { te: "విజయవంతంగా చేర్చబడింది", en: "Onboarded successfully" },
  weekly: { te: "ఈ వారం", en: "This week" },
  noUnits: { te: "నిర్వహించదగిన యూనిట్లు లేవు", en: "No units to manage" },
};

// Telugu-first role labels (no shared i18n keys exist for roles).
const ROLE_LABEL: Record<Role, { te: string; en: string }> = {
  worker: { te: "కార్యకర్త", en: "Member" },
  booth_leader: { te: "ఏరియా లీడర్", en: "Area leader" },
  mandal_leader: { te: "మండల్ లీడర్", en: "Mandal leader" },
  constituency_leader: { te: "నియోజకవర్గ లీడర్", en: "Constituency leader" },
  district_leader: { te: "జిల్లా లీడర్", en: "District leader" },
  state_admin: { te: "రాష్ట్ర అడ్మిన్", en: "State admin" },
  hq_admin: { te: "హెచ్‌క్యూ అడ్మిన్", en: "HQ admin" },
};

const TIER_LABEL: Record<Tier, { te: string; en: string }> = {
  karyakarta: { te: "కార్యకర్త", en: "Karyakarta" },
  sevak: { te: "సేవక్", en: "Sevak" },
  pramukh: { te: "ప్రముఖ్", en: "Pramukh" },
  nayak: { te: "నాయక్", en: "Nayak" },
  ratna: { te: "రత్న", en: "Ratna" },
};

const ORG_TYPE_LABEL_TE: Record<string, string> = {
  state: "రాష్ట్రం",
  district: "జిల్లా",
  constituency: "నియోజకవర్గం",
  mandal: "మండల్",
  booth: "బూత్",
};

const tx = (m: { te: string; en: string }, lang: Lang) => m[lang] ?? m.en;

function unitTypeLabel(type: OrgUnitNode["type"], lang: Lang): string {
  return lang === "te" ? (ORG_TYPE_LABEL_TE[type] ?? ORG_TYPE_LABEL[type]) : ORG_TYPE_LABEL[type];
}

export default function Team() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const { user, api } = useAuth();

  // Non-leaders cannot access this screen
  if (user && !user.isLeader) {
    return (
      <StateView
        title={lang === "te" ? "ప్రాప్తి నిరాకరించబడింది" : "Access Restricted"}
        message={
          lang === "te"
            ? "ఈ స్క్రీన్ నాయకులకు మాత్రమే అందుబాటులో ఉంటుంది."
            : "This screen is only available to leaders."
        }
      />
    );
  }

  const units = useApi<OrgUnitNode[]>("/org/manageable");

  // The unit whose roster we show + the unit we onboard into. Default to the
  // leader's own unit, else the first manageable unit.
  const [unitId, setUnitId] = useState<string | null>(null);
  useEffect(() => {
    if (unitId) return;
    const list = units.data;
    if (!list || list.length === 0) return;
    const own = list.find((u) => u.id === user?.orgUnitId);
    setUnitId(own?.id ?? list[0]!.id);
  }, [units.data, unitId, user?.orgUnitId]);

  const roster = useApi<OrgMemberRow[]>(unitId ? `/org/units/${unitId}/members?subtree=true` : null);

  const selectedUnit = useMemo(
    () => units.data?.find((u) => u.id === unitId) ?? null,
    [units.data, unitId],
  );

  // ---- onboard form state ----
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [formUnitId, setFormUnitId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [awarded, setAwarded] = useState<number | null>(null);

  // Keep the form unit in sync with the roster unit until the user changes it.
  useEffect(() => {
    if (!formUnitId && unitId) setFormUnitId(unitId);
  }, [unitId, formUnitId]);

  const formUnit = useMemo(
    () => units.data?.find((u) => u.id === formUnitId) ?? null,
    [units.data, formUnitId],
  );

  // Roles this actor may assign, narrowed to those that fit the chosen unit.
  const roleOptions = useMemo<Role[]>(() => {
    if (!user || !formUnit) return [];
    return assignableRoles(user.role).filter((r) => roleFitsUnit(r, formUnit.type));
  }, [user, formUnit]);

  // Keep the selected role valid for the current unit's options.
  useEffect(() => {
    if (roleOptions.length === 0) {
      if (role !== null) setRole(null);
      return;
    }
    if (!role || !roleOptions.includes(role)) setRole(roleOptions[0]!);
  }, [roleOptions, role]);

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0 && !!role && !!formUnitId;

  async function submit() {
    if (!role || !formUnitId) return;
    setBusy(true);
    setFormError(undefined);
    setAwarded(null);
    try {
      const res = await api<OnboardResult>("/org/members", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          role,
          orgUnitId: formUnitId,
          designation: designation.trim() || undefined,
        }),
      });
      setName("");
      setPhone("");
      setDesignation("");
      setAwarded(res.recruiterPointsAwarded);
      // Reload the roster if we onboarded into the unit currently shown.
      if (formUnitId === unitId) roster.reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View>
      <Text style={st.screenTitle}>{tx(L.title, lang)}</Text>

      {/* Roster unit picker */}
      <Text style={st.label}>{tx(L.unitLabel, lang)}</Text>
      <UnitChips
        units={units.data ?? []}
        value={unitId}
        onChange={setUnitId}
        lang={lang}
      />

      {selectedUnit ? (
        <View style={st.unitBanner}>
          <Text style={st.unitBannerName} numberOfLines={1}>
            {selectedUnit.name}
          </Text>
          <Text style={st.unitBannerMeta}>
            {unitTypeLabel(selectedUnit.type, lang)} · {selectedUnit.memberCount}
          </Text>
        </View>
      ) : null}

      <Text style={st.sectionTitle}>{tx(L.rosterTitle, lang)}</Text>
    </View>
  );

  return (
    <View style={st.fill}>
      {units.loading && !units.data ? (
        <View style={st.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </View>
      ) : units.error && !units.data ? (
        <StateView
          
          tone="error"
          title={tx(L.errorTitle, lang)}
          message={units.error}
          retryLabel={t("common.retry")}
          onRetry={units.reload}
        />
      ) : (units.data ?? []).length === 0 ? (
        <StateView  title={tx(L.noUnits, lang)} message={tx(L.emptyMsg, lang)} />
      ) : (
        <FlatList
          data={roster.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={st.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={roster.refreshing}
              onRefresh={roster.refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            roster.loading && !roster.data ? (
              <View>
                {[0, 1, 2].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </View>
            ) : roster.error ? (
              <StateView
                
                tone="error"
                title={tx(L.errorTitle, lang)}
                message={roster.error}
                retryLabel={t("common.retry")}
                onRetry={roster.reload}
              />
            ) : (
              <StateView  title={tx(L.emptyTitle, lang)} message={tx(L.emptyMsg, lang)} />
            )
          }
          renderItem={({ item }) => <MemberCard member={item} lang={lang} />}
          ListFooterComponent={
            <OnboardForm
              lang={lang}
              units={units.data ?? []}
              formUnitId={formUnitId}
              onPickUnit={setFormUnitId}
              roleOptions={roleOptions}
              role={role}
              onPickRole={setRole}
              name={name}
              onName={setName}
              phone={phone}
              onPhone={setPhone}
              designation={designation}
              onDesignation={setDesignation}
              busy={busy}
              canSubmit={canSubmit}
              onSubmit={submit}
              error={formError}
              awarded={awarded}
            />
          }
        />
      )}
    </View>
  );
}

function UnitChips({
  units,
  value,
  onChange,
  lang,
}: {
  units: OrgUnitNode[];
  value: string | null;
  onChange: (id: string) => void;
  lang: Lang;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.chipsContent}
    >
      {units.map((u) => {
        const active = u.id === value;
        return (
          <Pressable key={u.id} onPress={() => onChange(u.id)} style={({ pressed }) => [st.chip, active && st.chipActive, pressed && { opacity: 0.75 }]}>
            <Text style={[st.chipText, active && st.chipTextActive]} numberOfLines={1}>
              {u.name}
            </Text>
            <Text style={[st.chipSub, active && st.chipTextActive]}>{unitTypeLabel(u.type, lang)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MemberCard({ member: m, lang }: { member: OrgMemberRow; lang: Lang }) {
  const rc = tierColor[m.tier] ?? colors.textMuted;
  const roleColor = m.isLeader ? colors.primaryDark : colors.textMuted;
  const initial = m.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View style={st.memberRow}>
      <View style={st.avatarWrap}>
        {m.photoUrl ? (
          <RemoteImage uri={m.photoUrl} width={44} height={44} radius={22} placeholderColor={colors.cardMuted} />
        ) : (
          <View style={[st.avatarFallback, { backgroundColor: rc + "22" }]}>
            <Text style={[st.avatarInitial, { color: rc }]}>{initial}</Text>
          </View>
        )}
        <View
          style={[
            st.memberDot,
            { backgroundColor: m.membershipActive ? colors.success : colors.textMuted },
          ]}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={st.memberName} numberOfLines={1}>
          {m.name}
        </Text>
        <View style={st.chipsRow}>
          <View style={[st.roleChip, { borderColor: roleColor, backgroundColor: roleColor + "18" }]}>
            <Text style={[st.roleChipText, { color: roleColor }]}>{tx(ROLE_LABEL[m.role], lang)}</Text>
          </View>
          <View style={[st.tierChip, { backgroundColor: rc + "22" }]}>
            <Text style={[st.tierChipText, { color: rc }]}>{tx(TIER_LABEL[m.tier], lang)}</Text>
          </View>
        </View>
        {m.designation ? (
          <Text style={st.memberDesignation} numberOfLines={1}>
            {m.designation}
          </Text>
        ) : null}
      </View>

      <View style={st.pointsCol}>
        <Text style={st.points}>{m.weeklyLeaguePoints.toLocaleString()}</Text>
        <Text style={st.pointsLabel}>{tx(L.weekly, lang)}</Text>
      </View>
    </View>
  );
}

function OnboardForm(props: {
  lang: Lang;
  units: OrgUnitNode[];
  formUnitId: string | null;
  onPickUnit: (id: string) => void;
  roleOptions: Role[];
  role: Role | null;
  onPickRole: (r: Role) => void;
  name: string;
  onName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  designation: string;
  onDesignation: (v: string) => void;
  busy: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  error?: string;
  awarded: number | null;
}) {
  const { lang } = props;
  return (
    <Card style={st.formCard}>
      <Text style={st.formTitle}>{tx(L.onboardTitle, lang)}</Text>

      <Text style={st.label}>{tx(L.name, lang)}</Text>
      <TextInput
        style={st.input}
        value={props.name}
        onChangeText={props.onName}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
      />

      <Text style={st.label}>{tx(L.phone, lang)}</Text>
      <TextInput
        style={st.input}
        value={props.phone}
        onChangeText={(v) => props.onPhone(v.replace(/[^0-9]/g, ""))}
        keyboardType={Platform.OS === "web" ? "numeric" : "phone-pad"}
        inputMode="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={st.label}>{tx(L.unitPick, lang)}</Text>
      <UnitChips units={props.units} value={props.formUnitId} onChange={props.onPickUnit} lang={lang} />

      <Text style={st.label}>{tx(L.role, lang)}</Text>
      <View style={st.optWrap}>
        {props.roleOptions.map((r) => {
          const active = props.role === r;
          return (
            <Pressable
              key={r}
              onPress={() => props.onPickRole(r)}
              style={({ pressed }) => [st.opt, active && st.optActive, pressed && { opacity: 0.75 }]}
            >
              <Text style={[st.optText, active && st.optTextActive]}>{tx(ROLE_LABEL[r], lang)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label}>{tx(L.designation, lang)}</Text>
      <TextInput
        style={st.input}
        value={props.designation}
        onChangeText={props.onDesignation}
        placeholderTextColor={colors.textMuted}
      />

      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          title={tx(L.submit, lang)}
          onPress={props.onSubmit}
          loading={props.busy}
          disabled={!props.canSubmit}
        />
      </View>

      {props.awarded !== null ? (
        <View style={st.celebrate}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={st.celebrateText}>{tx(L.added, lang)}</Text>
          </View>
          <Text style={st.celebratePoints}>
            +{props.awarded} {tx(L.pointsAwarded, lang)}
          </Text>
        </View>
      ) : null}
      {props.error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="alert-triangle" size={14} color={colors.danger} />
          <Text style={st.formError}>{props.error}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cardMuted },
  listContent: { padding: 14, paddingBottom: 40 },
  screenTitle: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 12, fontFamily: fontFamily, lineHeight: lh(22) },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 6, marginBottom: 10, fontFamily: fontFamily, lineHeight: lh(16) },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 12, marginBottom: 6, fontFamily: fontFamily, lineHeight: lh(13) },

  chipsContent: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: "700", color: colors.text, fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
  chipSub: { fontWeight: "600", color: colors.textMuted, fontSize: 11, marginTop: 1, fontFamily: fontFamily, lineHeight: lh(11) },
  chipTextActive: { color: "#fff", fontFamily: fontFamily },

  unitBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  unitBannerName: { color: "#fff", fontWeight: "800", fontSize: 15, flex: 1, fontFamily: fontFamily, lineHeight: lh(15) },
  unitBannerMeta: { color: colors.textMutedOnDark, fontWeight: "700", fontSize: 12, fontFamily: fontFamily, lineHeight: lh(12) },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  avatarWrap: { width: 44, height: 44 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "800", fontFamily: fontFamily, lineHeight: lh(18) },
  memberDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#fff",
  },
  memberName: { fontWeight: "700", color: colors.text, fontSize: 15, fontFamily: fontFamily, lineHeight: lh(15) },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  roleChip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  roleChipText: { fontSize: 11, fontWeight: "800", fontFamily: fontFamily, lineHeight: lh(11) },
  tierChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tierChipText: { fontSize: 11, fontWeight: "800", fontFamily: fontFamily, lineHeight: lh(11) },
  memberDesignation: { fontSize: 12, color: colors.textMuted, marginTop: 4, fontFamily: fontFamily, lineHeight: lh(12) },
  pointsCol: { alignItems: "flex-end", minWidth: 48 },
  points: { fontWeight: "800", color: colors.primaryDark, fontSize: 17, fontFamily: fontFamily, lineHeight: lh(17) },
  pointsLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600", fontFamily: fontFamily, lineHeight: lh(10) },

  formCard: { marginTop: 18, marginBottom: 8 },
  formTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 4, fontFamily: fontFamily, lineHeight: lh(18) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fff",
    fontFamily: fontFamily,
  },
  optWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
  },
  optActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optText: { fontWeight: "700", color: colors.text, fontSize: 13, fontFamily: fontFamily, lineHeight: lh(13) },
  optTextActive: { color: "#fff", fontFamily: fontFamily },
  celebrate: {
    marginTop: 14,
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  celebrateText: { color: colors.primaryDark, fontWeight: "800", fontSize: 15, fontFamily: fontFamily, lineHeight: lh(15) },
  celebratePoints: { color: colors.primaryDark, fontWeight: "800", fontSize: 20, marginTop: 2, fontFamily: fontFamily, lineHeight: lh(20) },
  formError: { marginTop: 12, color: colors.danger, fontWeight: "700", fontSize: 14, fontFamily: fontFamily, lineHeight: lh(14) },
});
