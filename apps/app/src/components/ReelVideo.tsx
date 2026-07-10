// Native reels video surface — expo-video with autoplay + loop + mute control.
// Only the ACTIVE reel plays; inactive reels are paused and rewound so a swipe
// back always restarts them Instagram-style. Progress is polled (250ms) while
// active and reported as a 0..1 ratio for the gold progress bar.
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";

const PROGRESS_POLL_MS = 250;

export interface ReelVideoProps {
  sourceUrl: string;
  thumbnailUrl?: string | null;
  /** Only the visible page's video plays. */
  isActive: boolean;
  muted: boolean;
  /** Playback position as 0..1 of duration, ~4x/sec while active. */
  onProgress?: (ratio: number) => void;
}

export function ReelVideo({ sourceUrl, thumbnailUrl, isActive, muted, onProgress }: ReelVideoProps) {
  const player = useVideoPlayer(sourceUrl, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  // Mute is session-global (toggled by tapping any reel) — keep player in sync.
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      /* player already released */
    }
  }, [player, muted]);

  // Play only while this page is the visible one; rewind when it leaves.
  useEffect(() => {
    try {
      if (isActive) {
        player.play();
      } else {
        player.pause();
        player.currentTime = 0;
      }
    } catch {
      /* player already released */
    }
  }, [player, isActive]);

  // Poll playback position for the progress bar (only while active).
  useEffect(() => {
    if (!isActive || !onProgress) return;
    const id = setInterval(() => {
      try {
        const duration = player.duration;
        if (duration > 0) onProgress(Math.min(player.currentTime / duration, 1));
      } catch {
        /* player already released */
      }
    }, PROGRESS_POLL_MS);
    return () => clearInterval(id);
  }, [player, isActive, onProgress]);

  return (
    <View style={st.fill}>
      {/* Thumbnail behind the surface so the first paint isn't a black hole */}
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
});
