import React from "react";
import { type DimensionValue, StyleSheet, View } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import { colors } from "../theme";

/**
 * expo-image wrapper with a colored placeholder + fade-in so the feed and
 * avatars never flash blank. Cross-platform (web + native).
 */
export function RemoteImage({
  uri,
  width,
  height,
  radius: r = 0,
  contentFit = "cover",
  placeholderColor = colors.bgElevated,
  transition = 220,
  onLoad,
  onError,
}: {
  uri?: string | null;
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  contentFit?: ImageContentFit;
  placeholderColor?: string;
  /** Fade-in duration. Pass 0 when the view will be captured via view-shot. */
  transition?: number;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <View
      style={[
        s.wrap,
        { width, height, borderRadius: r, backgroundColor: placeholderColor },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={transition}
          cachePolicy="memory-disk"
          onLoad={onLoad}
          onError={onError}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { overflow: "hidden" },
});
