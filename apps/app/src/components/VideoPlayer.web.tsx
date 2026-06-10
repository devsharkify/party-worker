// Web-only: renders an HTML5 <video> element with the worker identity overlay
// drawn on top as React Native Views (react-native-web maps them to DOM divs).
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { RemoteImage } from "./RemoteImage";
import { colors, fontFamily, lh } from "../theme";

export interface VideoPlayerHandle {
  /** Returns the underlying HTMLVideoElement (web only). */
  getVideoElement(): HTMLVideoElement | null;
}

interface Props {
  sourceUrl: string;
  thumbnailUrl?: string | null;
  photoUrl?: string | null;
  name: string;
  designation?: string | null;
  booth: string;
  aiLabel: string;
  showControls?: boolean;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { sourceUrl, thumbnailUrl, photoUrl, name, designation, booth, aiLabel, showControls = true },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
  }));

  return (
    <View style={st.wrap}>
      {/* HTML5 video element — rendered natively by react-native-web */}
      <video
        ref={videoRef}
        src={sourceUrl}
        poster={thumbnailUrl ?? undefined}
        controls={showControls}
        playsInline
        muted={false}
        crossOrigin="anonymous"
        style={st.video as unknown as React.CSSProperties}
      />

      {/* Scrim for text legibility */}
      <View style={st.scrim} pointerEvents="none" />

      {/* Worker identity overlay */}
      <View style={st.identity} pointerEvents="none">
        <View style={st.photoWrap}>
          <RemoteImage uri={photoUrl} width={64} height={64} radius={32} placeholderColor="#cbd5e1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{name}</Text>
          {designation ? <Text style={st.designation} numberOfLines={1}>{designation}</Text> : null}
          <Text style={st.booth} numberOfLines={1}>{booth}</Text>
        </View>
      </View>

      {/* AI label band */}
      <View style={st.aiBand} pointerEvents="none">
        <Text style={st.aiText}>{aiLabel}</Text>
      </View>
    </View>
  );
});

export default VideoPlayer;

const st = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 340,
    aspectRatio: 9 / 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  } as object,
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
    background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.68))",
  } as object,
  identity: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: "12%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoWrap: {
    borderRadius: 35,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 6, fontFamily, lineHeight: lh(16) },
  designation: { color: colors.gold, fontSize: 12, fontWeight: "700", fontFamily, lineHeight: lh(12) },
  booth: { color: "#fff", fontSize: 11, fontFamily, lineHeight: lh(11) },
  aiBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "7%",
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiText: { color: "#fff", fontSize: 10, fontWeight: "600" },
});
