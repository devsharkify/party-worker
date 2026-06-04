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
}: {
  uri?: string | null;
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  contentFit?: ImageContentFit;
  placeholderColor?: string;
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
          transition={220}
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { overflow: "hidden" },
});
