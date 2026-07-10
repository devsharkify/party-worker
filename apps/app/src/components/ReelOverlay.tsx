// Instagram-Reels-style overlay for the fullscreen player: top bar (back +
// title + badges), right action rail (Share/Personalize/Copy), editable
// caption with 2-line clamp + "మరింత" expand, gold progress bar, mute flash,
// and the web "tap for sound" hint chip. Pure overlay — the video and gesture
// paging live in app/reels/[id].tsx.
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeedItem } from "@pw/shared";
import { colors, fontFamily, lh, radius } from "../theme";

const CAPTION_MAX_LEN = 2200;
const EXPAND_THRESHOLD = 80; // chars before the "మరింత" toggle appears
const COPY_TOAST_MS = 1800;
const FLASH_MS = 650;

const L = {
  more: { te: "మరింత", en: "more" },
  less: { te: "తక్కువ", en: "less" },
  share: { te: "షేర్", en: "Share" },
  personalize: { te: "పర్సనలైజ్", en: "Personalize" },
  copy: { te: "కాపీ", en: "Copy" },
  copied: { te: "అయింది ✓", en: "Copied ✓" },
  save: { te: "సేవ్", en: "Save" },
  cancel: { te: "రద్దు", en: "Cancel" },
  editCaption: { te: "క్యాప్షన్ మార్చండి", en: "Edit caption" },
  soundHint: { te: "టాప్ చేసి సౌండ్ ఆన్ చేయండి", en: "Tap for sound" },
};

export interface ReelOverlayProps {
  item: FeedItem;
  /** Current caption (session-edited if the worker changed it). */
  caption: string;
  onCaptionChange: (text: string) => void;
  muted: boolean;
  /** Increments on every mute toggle → drives the center icon flash. */
  flashTick: number;
  /** Playback progress 0..1 for the gold bar. */
  progress: number;
  showSoundHint: boolean;
  lang: "te" | "en";
  onBack: () => void;
  onShare: () => void;
  onPersonalize: () => void;
}

export function ReelOverlay({
  item, caption, onCaptionChange, muted, flashTick, progress,
  showSoundHint, lang, onBack, onShare, onPersonalize,
}: ReelOverlayProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption);
  const [copied, setCopied] = useState(false);

  const isPersonalized = !!(item.personalizedUrl || item.personalizedVideoUrl);
  const canExpand = caption.length > EXPAND_THRESHOLD;

  const copyCaption = async () => {
    try {
      await Clipboard.setStringAsync(caption);
    } catch {
      /* clipboard unavailable — non-fatal */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_TOAST_MS);
  };

  const startEdit = () => {
    setDraft(caption);
    setEditing(true);
  };
  const saveEdit = () => {
    onCaptionChange(draft.trim().length > 0 ? draft : caption);
    setEditing(false);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ── Top scrim (layered rgba, no gradient lib) ── */}
      <View style={[st.topScrim, { height: insets.top + 96 }]} pointerEvents="none">
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.45)", flex: 3 }]} />
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.22)", flex: 2 }]} />
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.08)", flex: 2 }]} />
      </View>

      {/* ── Top bar: back + title + badges ── */}
      <View style={[st.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [st.backBtn, pressed && st.pressedIcon]}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={st.topTitleWrap} pointerEvents="none">
          <View style={st.titleRow}>
            {item.isBreaking ? (
              <View style={st.breakingBadge}><Text style={st.breakingText}>🚨 BREAKING</Text></View>
            ) : item.isNew && !isPersonalized ? (
              <View style={st.newBadge}><Text style={st.newText}>NEW</Text></View>
            ) : null}
            {isPersonalized ? (
              <View style={st.personalizedDot}><Feather name="check" size={10} color={colors.primaryDark} /></View>
            ) : null}
            <Text style={st.title} numberOfLines={1}>{item.title}</Text>
          </View>
          {item.orgUnitName ? (
            <Text style={st.orgUnit} numberOfLines={1}>{item.orgUnitName}</Text>
          ) : null}
        </View>
      </View>

      {/* ── Center mute flash ── */}
      <MuteFlash muted={muted} flashTick={flashTick} />

      {/* ── Web sound hint chip ── */}
      {showSoundHint ? (
        <View style={[st.soundHint, { bottom: insets.bottom + 190 }]} pointerEvents="none">
          <Feather name="volume-x" size={13} color={colors.gold} />
          <Text style={st.soundHintText}>{L.soundHint[lang]}</Text>
        </View>
      ) : null}

      {/* ── Right action rail ── */}
      {!editing && (
        <View style={[st.rail, { bottom: insets.bottom + 88 }]} pointerEvents="box-none">
          <RailButton
            icon="send"
            label={L.share[lang]}
            primary
            onPress={onShare}
          />
          <RailButton
            icon="user"
            label={L.personalize[lang]}
            onPress={onPersonalize}
          />
          <RailButton
            icon={copied ? "check" : "copy"}
            label={copied ? L.copied[lang] : L.copy[lang]}
            active={copied}
            onPress={() => void copyCaption()}
          />
        </View>
      )}

      {/* ── Bottom scrim behind caption ── */}
      <View style={[st.bottomScrim, { height: insets.bottom + 170 }]} pointerEvents="none">
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.06)", flex: 2 }]} />
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.22)", flex: 2 }]} />
        <View style={[st.scrimSlice, { backgroundColor: "rgba(0,0,0,0.5)", flex: 3 }]} />
      </View>

      {/* ── Caption block / inline editor (keyboard-safe) ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={st.captionKav}
        pointerEvents="box-none"
      >
        <View style={[st.captionWrap, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
          {editing ? (
            <View style={st.editorBox}>
              <Text style={st.editorLabel}>{L.editCaption[lang]}</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                maxLength={CAPTION_MAX_LEN}
                style={st.editorInput}
                placeholder={L.editCaption[lang]}
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              <View style={st.editorActions}>
                <Pressable
                  onPress={() => setEditing(false)}
                  style={({ pressed }) => [st.editorCancel, pressed && { opacity: 0.7 }]}
                >
                  <Text style={st.editorCancelText}>{L.cancel[lang]}</Text>
                </Pressable>
                <Pressable
                  onPress={saveEdit}
                  style={({ pressed }) => [st.editorSave, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <Feather name="check" size={14} color={colors.primaryDark} />
                  <Text style={st.editorSaveText}>{L.save[lang]}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={st.captionHead}>
                <View style={st.captionAccent} />
                <Pressable
                  onPress={startEdit}
                  hitSlop={12}
                  style={({ pressed }) => [st.editPencil, pressed && st.pressedIcon]}
                >
                  <Feather name="edit-2" size={13} color={colors.gold} />
                </Pressable>
              </View>
              <Pressable onPress={() => canExpand && setExpanded((e) => !e)}>
                <Text style={st.caption} numberOfLines={expanded ? 8 : 2}>{caption}</Text>
                {canExpand ? (
                  <Text style={st.moreText}>{expanded ? L.less[lang] : L.more[lang]}</Text>
                ) : null}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Gold progress bar — the very bottom of the reel ── */}
      <View style={st.progressTrack} pointerEvents="none">
        <View
          style={[
            st.progressFill,
            { transform: [{ scaleX: Math.max(progress, 0.002) }] },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Rail button ──────────────────────────────────────────────────────────────

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function RailButton({
  icon, label, onPress, primary, active,
}: {
  icon: FeatherName; label: string; onPress: () => void; primary?: boolean; active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        st.railBtn,
        pressed && { transform: [{ scale: 0.88 }], opacity: 0.85 },
      ]}
    >
      <View style={[st.railCircle, primary && st.railCirclePrimary, active && st.railCircleActive]}>
        <Feather
          name={icon}
          size={primary ? 24 : 20}
          color={primary ? colors.primaryDark : active ? colors.gold : "#fff"}
        />
      </View>
      <Text style={[st.railLabel, primary && st.railLabelPrimary]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ─── Mute flash (center icon that fades on toggle) ────────────────────────────

function MuteFlash({ muted, flashTick }: { muted: boolean; flashTick: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (flashTick === 0) return; // no flash on first mount
    opacity.setValue(1);
    scale.setValue(0.7);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: FLASH_MS, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.15, duration: FLASH_MS, useNativeDriver: true }),
    ]).start();
  }, [flashTick, opacity, scale]);

  return (
    <Animated.View style={[st.flashWrap, { opacity, transform: [{ scale }] }]} pointerEvents="none">
      <Feather name={muted ? "volume-x" : "volume-2"} size={30} color="#fff" />
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const RAIL_RIGHT = 10;
const CAPTION_RIGHT_GAP = 82; // keeps caption clear of the rail

const st = StyleSheet.create({
  // Scrims
  topScrim: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0 },
  scrimSlice: { width: "100%" },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 10,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pressedIcon: { opacity: 0.7, transform: [{ scale: 0.92 }] },
  topTitleWrap: { flex: 1, paddingRight: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    flex: 1, color: "#fff", fontSize: 14, fontWeight: "700",
    fontFamily, lineHeight: lh(14),
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  orgUnit: {
    color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "600",
    fontFamily, lineHeight: lh(11), marginTop: 1,
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  breakingBadge: {
    backgroundColor: colors.danger, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  breakingText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5, fontFamily, lineHeight: lh(8) },
  newBadge: {
    backgroundColor: colors.gold, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  newText: { color: colors.primaryDark, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, fontFamily, lineHeight: lh(9) },
  personalizedDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.gold, alignItems: "center", justifyContent: "center",
  },

  // Mute flash
  flashWrap: {
    position: "absolute",
    top: "44%", alignSelf: "center",
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },

  // Sound hint chip (web)
  soundHint: {
    position: "absolute", alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1, borderColor: "rgba(232,168,32,0.55)",
    borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  soundHintText: { color: "#fff", fontSize: 12, fontWeight: "600", fontFamily, lineHeight: lh(12) },

  // Right rail
  rail: {
    position: "absolute", right: RAIL_RIGHT,
    alignItems: "center", gap: 18,
  },
  railBtn: { alignItems: "center", gap: 4, minWidth: 56 },
  railCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  railCirclePrimary: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.gold,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  railCircleActive: { borderColor: colors.gold },
  railLabel: {
    color: "rgba(255,255,255,0.92)", fontSize: 10, fontWeight: "700",
    fontFamily, lineHeight: lh(10),
    textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  railLabelPrimary: { color: colors.gold, fontSize: 11, lineHeight: lh(11) },

  // Caption
  captionKav: { position: "absolute", bottom: 0, left: 0, right: 0 },
  captionWrap: { paddingLeft: 14, paddingRight: CAPTION_RIGHT_GAP },
  captionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  captionAccent: { width: 3, height: 12, borderRadius: 2, backgroundColor: colors.gold },
  editPencil: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1, borderColor: "rgba(232,168,32,0.5)",
  },
  caption: {
    color: "#fff", fontSize: 14, fontFamily, lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  moreText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700",
    fontFamily, lineHeight: lh(12), marginTop: 3,
  },

  // Inline caption editor
  editorBox: {
    backgroundColor: "rgba(10,18,42,0.94)",
    borderRadius: radius.md,
    borderWidth: 1, borderColor: "rgba(232,168,32,0.45)",
    padding: 12,
    marginRight: -(CAPTION_RIGHT_GAP - 14), // reclaim the rail gap while editing
  },
  editorLabel: {
    color: colors.gold, fontSize: 11, fontWeight: "700",
    fontFamily, lineHeight: lh(11), marginBottom: 6, letterSpacing: 0.4,
  },
  editorInput: {
    color: "#fff", fontSize: 14, fontFamily, lineHeight: 20,
    minHeight: 84, maxHeight: 160,
    textAlignVertical: "top",
    padding: 0,
  },
  editorActions: {
    flexDirection: "row", justifyContent: "flex-end",
    alignItems: "center", gap: 14, marginTop: 10,
  },
  editorCancel: { paddingVertical: 8, paddingHorizontal: 10 },
  editorCancelText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700", fontFamily, lineHeight: lh(13) },
  editorSave: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.gold, borderRadius: radius.pill,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  editorSaveText: { color: colors.primaryDark, fontSize: 13, fontWeight: "900", fontFamily, lineHeight: lh(13) },

  // Progress bar
  progressTrack: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.gold,
    transformOrigin: "left",
  },
});
