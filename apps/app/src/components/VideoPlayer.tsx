// Native fallback: shows the video thumbnail + worker identity overlay.
// Full native video playback requires expo-av (not yet installed).
// A "play" tap opens the source URL in the system browser/player.
import { forwardRef, useImperativeHandle } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { RemoteImage } from "./RemoteImage";
import { colors, fontFamily, lh } from "../theme";

export interface VideoPlayerHandle {
  getVideoElement(): null;
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
  { sourceUrl, thumbnailUrl, photoUrl, name, designation, booth, aiLabel },
  ref,
) {
  useImperativeHandle(ref, () => ({ getVideoElement: () => null }));

  return (
    <View style={st.wrap}>
      {/* Thumbnail as static preview */}
      <Image
        source={{ uri: thumbnailUrl ?? sourceUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      {/* Tap-to-play overlay */}
      <View
        style={st.playOverlay}
        // @ts-expect-error -- onClick works via react-native-web; for true native, use Pressable
        onClick={() => Linking.openURL(sourceUrl)}
      >
        <View style={st.playBtn}>
          <Feather name="play" size={22} color="#fff" />
        </View>
      </View>

      {/* Scrim */}
      <View style={st.scrim} pointerEvents="none" />

      {/* Worker identity overlay */}
      <View style={st.identity} pointerEvents="none">
        <View style={st.photoWrap}>
          <RemoteImage uri={photoUrl} width={56} height={56} radius={28} placeholderColor="#cbd5e1" />
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
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
    backgroundColor: "transparent",
  },
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
  name: { color: "#fff", fontSize: 16, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 6, fontFamily: fontFamily, lineHeight: lh(16) },
  designation: { color: colors.gold, fontSize: 12, fontWeight: "700", fontFamily: fontFamily, lineHeight: lh(12) },
  booth: { color: "#fff", fontSize: 11, fontFamily: fontFamily, lineHeight: lh(11) },
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
  aiText: { color: "#fff", fontSize: 10, fontWeight: "600", fontFamily: fontFamily, lineHeight: lh(10) },
});
