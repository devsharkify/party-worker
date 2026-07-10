// Fullscreen Instagram-Reels-style vertical pager. Opened from a video tile
// on the feed (/reels/<creativeId>). Swipe up/down pages between the feed's
// video creatives; only the visible reel plays (looping); single tap toggles
// mute; caption is session-editable and travels to the share flow via the
// existing "caption pre-copied" clipboard pattern.
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import type { FeedItem } from "@pw/shared";
import { useApi } from "../../src/hooks";
import { StateView } from "../../src/components/StateView";
import { ReelVideo } from "../../src/components/ReelVideo";
import { ReelOverlay } from "../../src/components/ReelOverlay";

/** A page must be ~fully visible before it becomes the playing reel. */
const VISIBLE_THRESHOLD_PCT = 80;

/** Default caption for a creative: Telugu first, then English, then title. */
function defaultCaption(item: FeedItem, lang: "te" | "en"): string {
  const variants = item.captionVariants ?? {};
  return variants[lang] ?? variants.te ?? variants.en ?? Object.values(variants)[0] ?? item.title;
}

export default function ReelsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "te") as "te" | "en";
  const { data, loading, error, reload } = useApi<FeedItem[]>("/feed");

  // Videos only, with the tapped reel FIRST (Instagram-style) — reordering
  // instead of initialScrollIndex because RN-web's scroll-to-index is flaky,
  // which left the visible page inactive (rendered but paused).
  const videos = useMemo(() => {
    const vids = (data ?? []).filter((it) => it.type === "video");
    const i = vids.findIndex((v) => v.creativeId === (id ?? ""));
    return i > 0 ? [vids[i], ...vids.slice(0, i), ...vids.slice(i + 1)] : vids;
  }, [data, id]);

  if (error && videos.length === 0) {
    return (
      <View style={st.fill}>
        <Stack.Screen options={{ headerShown: false }} />
        <StateView tone="error" dark title="Reels" message={error} retryLabel="Retry" onRetry={reload} />
      </View>
    );
  }

  if (loading && videos.length === 0) {
    return (
      <View style={st.fill}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  return (
    <View style={st.fill}>
      <Stack.Screen options={{ headerShown: false }} />
      <ReelsPager videos={videos} lang={lang} />
    </View>
  );
}

// ─── Pager (mounted only once the videos are known) ──────────────────────────

function ReelsPager({ videos, lang }: { videos: FeedItem[]; lang: "te" | "en" }) {
  const router = useRouter();
  // useWindowDimensions tracks browser resizes on web (100vh-safe) and
  // orientation changes on native.
  const { height, width } = useWindowDimensions();

  // Tapped reel is always element 0 (list is pre-ordered by the screen).
  const [activeIndex, setActiveIndex] = useState(0);

  // Sound: browsers block autoplay WITH sound → web starts muted with a hint
  // chip; native starts unmuted. One mute state for the whole session.
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [flashTick, setFlashTick] = useState(0);
  const [everUnmuted, setEverUnmuted] = useState(Platform.OS !== "web");

  // Per-session caption edits, keyed by creativeId (no server write).
  const [editedCaptions, setEditedCaptions] = useState<Record<string, string>>({});

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (m) setEverUnmuted(true);
      return !m;
    });
    setFlashTick((tk) => tk + 1);
  }, []);

  const captionFor = useCallback(
    (item: FeedItem) => editedCaptions[item.creativeId] ?? defaultCaption(item, lang),
    [editedCaptions, lang],
  );

  const setCaptionFor = useCallback((creativeId: string, text: string) => {
    setEditedCaptions((prev) => ({ ...prev, [creativeId]: text }));
  }, []);

  /** Share: pre-copy the (possibly edited) caption — the share screen's own
   *  caption comes from the server, so the edited text rides the clipboard,
   *  matching the app's existing "caption copied — paste it" pattern. */
  const shareReel = useCallback(
    (item: FeedItem) => {
      void Clipboard.setStringAsync(captionFor(item)).catch(() => undefined);
      router.push(`/share/${item.creativeId}`);
    },
    [captionFor, router],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/feed");
  }, [router]);

  // Viewability: the page ≥80% on screen is the playing reel.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: VISIBLE_THRESHOLD_PCT }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable && v.index != null);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  return (
    <FlatList
      data={videos}
      keyExtractor={(it) => it.creativeId}
      renderItem={({ item, index }) => (
        <ReelPage
          item={item}
          height={height}
          width={width}
          isActive={index === activeIndex}
          muted={muted}
          flashTick={flashTick}
          showSoundHint={Platform.OS === "web" && muted && !everUnmuted && index === activeIndex}
          lang={lang}
          caption={captionFor(item)}
          onCaptionChange={(text) => setCaptionFor(item.creativeId, text)}
          onTap={toggleMute}
          onBack={goBack}
          onShare={() => shareReel(item)}
          onPersonalize={() => router.push(`/personalize/${item.creativeId}`)}
        />
      )}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      disableIntervalMomentum
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews={Platform.OS !== "web"}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      style={st.fill}
    />
  );
}

// ─── One reel page (owns its progress so ticks don't re-render the list) ─────

function ReelPage({
  item, height, width, isActive, muted, flashTick, showSoundHint, lang,
  caption, onCaptionChange, onTap, onBack, onShare, onPersonalize,
}: {
  item: FeedItem;
  height: number;
  width: number;
  isActive: boolean;
  muted: boolean;
  flashTick: number;
  showSoundHint: boolean;
  lang: "te" | "en";
  caption: string;
  onCaptionChange: (text: string) => void;
  onTap: () => void;
  onBack: () => void;
  onShare: () => void;
  onPersonalize: () => void;
}) {
  const [progress, setProgress] = useState(0);

  return (
    <View style={{ height, width, backgroundColor: "#000" }}>
      {/* Tap anywhere on the video toggles mute (reels loop; no play/pause). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap}>
        <ReelVideo
          sourceUrl={item.sourceUrl}
          thumbnailUrl={item.thumbnailUrl}
          isActive={isActive}
          muted={muted}
          onProgress={isActive ? setProgress : undefined}
        />
      </Pressable>
      <ReelOverlay
        item={item}
        caption={caption}
        onCaptionChange={onCaptionChange}
        muted={muted}
        flashTick={isActive ? flashTick : 0}
        progress={isActive ? progress : 0}
        showSoundHint={showSoundHint}
        lang={lang}
        onBack={onBack}
        onShare={onShare}
        onPersonalize={onPersonalize}
      />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
});
