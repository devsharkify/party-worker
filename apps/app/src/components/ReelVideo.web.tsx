// Web reels video surface — raw HTML5 <video> for precise autoplay control.
// Browsers block autoplay WITH sound, so the pager starts web muted and shows
// an unmute hint chip; this component just obeys `muted`/`isActive`.
// The `muted` DOM property is set imperatively because React does not reliably
// update the attribute after mount.
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ReelVideoProps } from "./ReelVideo";

export type { ReelVideoProps };

export function ReelVideo({ sourceUrl, thumbnailUrl, isActive, muted, onProgress }: ReelVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      // Muted autoplay is always allowed; unmuted play() only ever runs after
      // a user tap (mute toggle), which satisfies the gesture requirement.
      void el.play().catch(() => undefined);
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [isActive]);

  return (
    <View style={st.fill}>
      <video
        ref={videoRef}
        src={sourceUrl}
        poster={thumbnailUrl ?? undefined}
        loop
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) onProgress?.(Math.min(el.currentTime / el.duration, 1));
        }}
        style={st.video as unknown as React.CSSProperties}
      />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  } as object,
});
