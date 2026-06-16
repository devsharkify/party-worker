import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type {
  AreaGrievanceSummary,
  CreateGrievanceDto,
  GrievanceCreated,
  GrievanceStatus,
  GrievanceSummary,
} from "@pw/shared";
import { useAuth } from "../../src/auth/auth-context";
import { useApi } from "../../src/hooks";
import { Card, Pill, PrimaryButton, Screen } from "../../src/components/ui";
import { colors, fontFamily, lh, radius } from "../../src/theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CATEGORY_KEYS = [
  "catRoads",
  "catWater",
  "catPower",
  "catSanitation",
  "catHealth",
  "catOther",
] as const;

const STATUS_STEPS: GrievanceStatus[] = ["open", "routed", "in_progress", "resolved"];

const STATUS_COLOR: Record<GrievanceStatus, string> = {
  open: "#64748b",
  routed: colors.primary,
  in_progress: "#f59e0b",
  resolved: colors.green,
  rejected: colors.danger,
};

type FeatherName = React.ComponentProps<typeof Feather>["name"];
const STATUS_ICON: Record<GrievanceStatus, FeatherName> = {
  open: "file-text",
  routed: "send",
  in_progress: "tool",
  resolved: "check-circle",
  rejected: "x-circle",
};

function stepIndex(status: GrievanceStatus): number {
  const i = STATUS_STEPS.indexOf(status);
  return i === -1 ? 0 : i; // rejected shows at step 0 with red colour
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusStepper({ status }: { status: GrievanceStatus }) {
  const isRejected = status === "rejected";
  const current = stepIndex(status);
  return (
    <View style={ss.stepWrap}>
      {STATUS_STEPS.map((s, i) => {
        const done = i <= current && !isRejected;
        const active = i === current && !isRejected;
        return (
          <View key={s} style={ss.stepItem}>
            <View
              style={[
                ss.stepDot,
                done && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] },
                active && ss.stepDotActive,
              ]}
            >
              {done && active ? (
                <Feather name={STATUS_ICON[s]} size={10} color="#fff" />
              ) : done ? (
                <Feather name="check" size={10} color="#fff" />
              ) : (
                <Text style={ss.stepDotText}>{i + 1}</Text>
              )}
            </View>
            {i < STATUS_STEPS.length - 1 && (
              <View style={[ss.stepLine, i < current && !isRejected && { backgroundColor: colors.primary }]} />
            )}
          </View>
        );
      })}
      {isRejected && (
        <View style={ss.rejectedBadge}>
          <Feather name="x-circle" size={13} color={colors.danger} />
          <Text style={ss.rejectedText}>Rejected</Text>
        </View>
      )}
    </View>
  );
}

function GrievanceCard({ g }: { g: GrievanceSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded((v) => !v)}>
      <Card>
        <View style={st.row}>
          <Text style={st.gTitle} numberOfLines={expanded ? undefined : 1}>
            {g.title}
          </Text>
          <Pill
            label={g.status.replace("_", " ")}
            color={STATUS_COLOR[g.status]}
          />
        </View>
        <Text style={st.gDate}>{new Date(g.createdAt).toLocaleDateString()}</Text>

        {/* Status stepper — always visible */}
        <View style={{ marginTop: 10 }}>
          <StatusStepper status={g.status} />
        </View>

        {expanded && (
          <View style={st.expandedDetail}>
            {g.description ? (
              <Text style={st.detailText}>{g.description}</Text>
            ) : null}
            {g.location ? (
              <Text style={st.detailMeta}>📍 {g.location}</Text>
            ) : null}
            {g.lat != null && g.lng != null ? (
              <Text style={st.detailMeta}>
                🗺 {g.lat.toFixed(5)}, {g.lng.toFixed(5)}
              </Text>
            ) : null}
            {g.photoUrl ? (
              <Image
                source={{ uri: g.photoUrl }}
                style={st.photoThumb}
                resizeMode="cover"
              />
            ) : null}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function AreaCard({ g }: { g: AreaGrievanceSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded((v) => !v)}>
      <Card style={st.areaCard}>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={st.gTitle} numberOfLines={1}>
              {g.title}
            </Text>
            <Text style={st.areaUnit}>📍 {g.orgUnitName}</Text>
          </View>
          <Pill label={g.status.replace("_", " ")} color={STATUS_COLOR[g.status]} />
        </View>
        <Text style={st.gDate}>{new Date(g.createdAt).toLocaleDateString()}</Text>
        {expanded && (
          <View style={st.expandedDetail}>
            {g.description ? (
              <Text style={st.detailText}>{g.description}</Text>
            ) : null}
            {g.location ? (
              <Text style={st.detailMeta}>📍 {g.location}</Text>
            ) : null}
            {g.photoUrl ? (
              <Image source={{ uri: g.photoUrl }} style={st.photoThumb} resizeMode="cover" />
            ) : null}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Photo picker (web: hidden file input; native: expo-image-picker)
// ---------------------------------------------------------------------------
function PhotoPicker({
  photoDataUrl,
  onPhoto,
  onPhotoUri,
  onClear,
  uploading,
}: {
  photoDataUrl: string | null;
  onPhoto: (file: File) => void;
  onPhotoUri?: (uri: string) => void;
  onClear: () => void;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (Platform.OS !== "web") {
    async function pickNative() {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.85,
      });
      const asset = res.assets?.[0];
      if (!res.canceled && asset) onPhotoUri?.(asset.uri);
    }

    if (photoDataUrl) {
      return (
        <View style={st.photoPreviewWrap}>
          <Image source={{ uri: photoDataUrl }} style={st.photoPreview} resizeMode="cover" />
          {uploading && (
            <View style={st.photoUploadingOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <Pressable style={st.photoClearBtn} onPress={onClear}>
            <Text style={st.photoClearText}>✕</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Pressable style={st.photoAddBtn} onPress={() => { void pickNative(); }}>
        <Feather name="camera" size={22} color={colors.primary} />
        <Text style={st.photoAddText}>Add photo</Text>
      </Pressable>
    );
  }

  return (
    <View>
      {/* Hidden file input — web only */}
      <input
        ref={fileRef as unknown as React.Ref<HTMLInputElement>}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhoto(f);
        }}
      />
      {photoDataUrl ? (
        <View style={st.photoPreviewWrap}>
          <Image source={{ uri: photoDataUrl }} style={st.photoPreview} resizeMode="cover" />
          {uploading && (
            <View style={st.photoUploadingOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <Pressable style={st.photoClearBtn} onPress={onClear}>
            <Text style={st.photoClearText}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={st.photoAddBtn}
          onPress={() => (fileRef.current as unknown as HTMLInputElement | null)?.click()}
        >
          <Feather name="camera" size={22} color={colors.primary} />
          <Text style={st.photoAddText}>Add photo</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// GPS button (web: navigator.geolocation; native: expo-location)
// ---------------------------------------------------------------------------
function LocationPicker({
  location,
  lat,
  lng,
  onLocation,
}: {
  location: string;
  lat: number | null;
  lng: number | null;
  onLocation: (loc: { text: string; lat?: number; lng?: number }) => void;
}) {
  const [locating, setLocating] = useState(false);

  async function getGps() {
    if (locating) return;
    setLocating(true);
    try {
      if (Platform.OS === "web") {
        if (!navigator?.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocating(false);
            onLocation({
              text: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          },
          () => setLocating(false),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      } else {
        const Location = await import("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        onLocation({
          text: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      }
    } catch {
      setLocating(false);
    }
  }

  return (
    <View style={st.locationRow}>
      <TextInput
        style={[st.input, { flex: 1 }]}
        value={location}
        onChangeText={(v) => onLocation({ text: v })}
        placeholder="Area / street name (optional)"
        placeholderTextColor={colors.textMuted}
      />
      <Pressable
        style={[st.gpsBtn, locating && { opacity: 0.6 }]}
        onPress={() => { void getGps(); }}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={st.gpsBtnText}>📍 GPS</Text>
        )}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function Grievances() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const mine = useApi<GrievanceSummary[]>("/grievances/mine");
  const area = useApi<AreaGrievanceSummary[]>("/grievances/area");

  // Form state
  const [category, setCategory] = useState<(typeof CATEGORY_KEYS)[number]>("catRoads");
  const [description, setDescription] = useState("");
  const [citizenName, setCitizenName] = useState("");
  const [citizenPhone, setCitizenPhone] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [activeTab, setActiveTab] = useState<"mine" | "area">("mine");

  async function handlePhoto(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setPhotoDataUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api<{ key: string }>("/creatives/upload", {
        method: "POST",
        body: formData,
        headers: {},
      });
      setPhotoKey(result.key);
    } catch {
      // keep preview, skip key
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handlePhotoUri(uri: string) {
    setPhotoDataUrl(uri);
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", { uri, name: "grievance.jpg", type: "image/jpeg" } as any);
      const result = await api<{ key: string }>("/creatives/upload", {
        method: "POST",
        body: formData,
        headers: {},
      });
      setPhotoKey(result.key);
    } catch {
      // keep preview, skip key
    } finally {
      setPhotoUploading(false);
    }
  }

  function handleLocation(loc: { text: string; lat?: number; lng?: number }) {
    setLocation(loc.text);
    if (loc.lat != null) setLat(loc.lat);
    if (loc.lng != null) setLng(loc.lng);
  }

  async function submit() {
    setBusy(true);
    setDone(false);
    try {
      const body: CreateGrievanceDto = {
        title: t(`grievances.${category}`),
        description: description.trim() || undefined,
        citizenName: citizenName.trim() || undefined,
        citizenPhone: citizenPhone.trim() || undefined,
        location: location.trim() || undefined,
        ...(photoKey ? { photoKey } : {}),
        ...(lat != null && lng != null ? { lat, lng } : {}),
      };
      await api<GrievanceCreated>("/grievances", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Reset
      setDescription("");
      setCitizenName("");
      setCitizenPhone("");
      setLocation("");
      setLat(null);
      setLng(null);
      setPhotoDataUrl(null);
      setPhotoKey(null);
      setDone(true);
      mine.reload();
      area.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {/* ---- New grievance form ---- */}
      <Card>
        <Text style={st.formTitle}>{t("grievances.newTitle")}</Text>

        <Text style={st.label}>{t("grievances.category")}</Text>
        <View style={st.catWrap}>
          {CATEGORY_KEYS.map((key) => {
            const active = category === key;
            return (
              <Pressable key={key} onPress={() => setCategory(key)} style={({ pressed }) => [st.cat, active && st.catActive, pressed && { opacity: 0.75 }]}>
                <Text style={[st.catText, active && st.catTextActive]}>{t(`grievances.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={st.label}>{t("grievances.description")}</Text>
        <TextInput
          style={[st.input, st.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder={t("grievances.descriptionPlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* Photo */}
        <Text style={st.label}>Photo (optional)</Text>
        <PhotoPicker
          photoDataUrl={photoDataUrl}
          onPhoto={handlePhoto}
          onPhotoUri={handlePhotoUri}
          onClear={() => { setPhotoDataUrl(null); setPhotoKey(null); }}
          uploading={photoUploading}
        />

        {/* Location */}
        <Text style={st.label}>Location (optional)</Text>
        <LocationPicker location={location} lat={lat} lng={lng} onLocation={handleLocation} />
        {lat != null && lng != null && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="map-pin" size={13} color={colors.success} />
            <Text style={st.gpsConfirm}>GPS captured: {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
          </View>
        )}

        <Text style={st.label}>{t("grievances.citizenName")}</Text>
        <TextInput
          style={st.input}
          value={citizenName}
          onChangeText={setCitizenName}
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={st.label}>{t("grievances.citizenPhone")}</Text>
        <TextInput
          style={st.input}
          value={citizenPhone}
          onChangeText={setCitizenPhone}
          keyboardType="phone-pad"
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <View style={{ marginTop: 16 }}>
          <PrimaryButton title={t("grievances.submit")} onPress={submit} loading={busy} />
        </View>
        {done ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
            <Feather name="check-circle" size={14} color={colors.success} />
            <Text style={st.done}>{t("grievances.submitted")} (+{15} pts)</Text>
          </View>
        ) : null}
      </Card>

      {/* ---- Tabs: Mine / Area ---- */}
      <View style={st.tabs}>
        <Pressable
          style={({ pressed }) => [st.tab, activeTab === "mine" && st.tabActive, pressed && { opacity: 0.75 }]}
          onPress={() => setActiveTab("mine")}
        >
          <Text style={[st.tabText, activeTab === "mine" && st.tabTextActive]}>
            My grievances {mine.data ? `(${mine.data.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [st.tab, activeTab === "area" && st.tabActive, pressed && { opacity: 0.75 }]}
          onPress={() => setActiveTab("area")}
        >
          <Text style={[st.tabText, activeTab === "area" && st.tabTextActive]}>
            In my area {area.data ? `(${area.data.length})` : ""}
          </Text>
        </Pressable>
      </View>

      {/* ---- Mine tab ---- */}
      {activeTab === "mine" && (
        <>
          {mine.loading && !mine.data && (
            <Text style={st.empty}>Loading…</Text>
          )}
          {mine.data && mine.data.length === 0 && (
            <Text style={st.empty}>{t("grievances.empty")}</Text>
          )}
          {(mine.data ?? []).map((g) => (
            <GrievanceCard key={g.id} g={g} />
          ))}
        </>
      )}

      {/* ---- Area tab ---- */}
      {activeTab === "area" && (
        <>
          {area.loading && !area.data && (
            <Text style={st.empty}>Loading area grievances…</Text>
          )}
          {area.data && area.data.length === 0 && (
            <Text style={st.empty}>No other grievances filed in your area yet.</Text>
          )}
          {(area.data ?? []).map((g) => (
            <AreaCard key={g.id} g={g} />
          ))}
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const st = StyleSheet.create({
  formTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 8, fontFamily: fontFamily, lineHeight: lh(18) },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 12, marginBottom: 6, fontFamily: fontFamily, lineHeight: lh(13) },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cat: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
  },
  catActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catText: { fontWeight: "700", color: colors.text, fontSize: 13, fontFamily: fontFamily, lineHeight: lh(13) },
  catTextActive: { color: "#fff", fontFamily: fontFamily },
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
  multiline: { minHeight: 90, textAlignVertical: "top" },
  // Photo
  photoAddBtn: {
    height: 80,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.cardMuted,
  } as object,
  photoAddText: { fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily: fontFamily, lineHeight: lh(14) },
  photoPreviewWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
    height: 180,
  },
  photoPreview: { width: "100%", height: 180 },
  photoUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoClearBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoClearText: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(14) },
  // Location
  locationRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  gpsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  gpsBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(13) },
  gpsConfirm: { color: colors.green, fontSize: 12, marginTop: 4, fontWeight: "600", fontFamily: fontFamily, lineHeight: lh(12) },
  done: { marginTop: 12, textAlign: "center", color: colors.success, fontWeight: "700", fontFamily: fontFamily },
  // Tabs
  tabs: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    marginBottom: -2,
  },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.textMuted, fontFamily: fontFamily, lineHeight: lh(14) },
  tabTextActive: { color: colors.primary, fontFamily: fontFamily },
  // Cards
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  gTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text, fontFamily: fontFamily, lineHeight: lh(16) },
  gDate: { fontSize: 12, color: colors.textMuted, marginTop: 4, fontFamily: fontFamily, lineHeight: lh(12) },
  areaCard: { borderLeftWidth: 3, borderLeftColor: "#e2e8f0" } as object,
  areaUnit: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontFamily: fontFamily, lineHeight: lh(12) },
  expandedDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailText: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 6, fontFamily: fontFamily },
  detailMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 4, fontFamily: fontFamily, lineHeight: lh(12) },
  photoThumb: { width: "100%", height: 160, borderRadius: radius.md, marginTop: 8 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 16, marginBottom: 20, fontFamily: fontFamily },
});

// ---------------------------------------------------------------------------
// Status stepper styles
// ---------------------------------------------------------------------------
const ss = StyleSheet.create({
  stepWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  stepDotText: { fontSize: 10, fontWeight: "700", color: "#fff", fontFamily: fontFamily, lineHeight: lh(10) },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  rejectedBadge: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "#fee2e2",
  },
  rejectedText: { fontSize: 12, fontWeight: "700", color: colors.danger, fontFamily: fontFamily, lineHeight: lh(12) },
});
