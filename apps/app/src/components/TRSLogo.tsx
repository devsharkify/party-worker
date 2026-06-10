/**
 * TRSLogo — the official TRS party emblem (real uploaded artwork).
 *
 * Assets:
 *   assets/trs-logo.png        — full emblem: gold panel + green banner (820×1066)
 *   assets/trs-logo-square.png — gold panel only, square crop (for headers)
 */

import React from "react";
import { Image, View } from "react-native";

const LOGO_FULL = require("../../assets/trs-logo.png");
const LOGO_SQUARE = require("../../assets/trs-logo-square.png");

// Real artwork dimensions
const ASPECT_FULL = 820 / 1066; // width / height
const ASPECT_SQUARE = 1;

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
};

export function TRSLogo({ size = 80, showBanner = true, borderRadius = 6 }: Props) {
  const source = showBanner ? LOGO_FULL : LOGO_SQUARE;
  const aspect = showBanner ? ASPECT_FULL : ASPECT_SQUARE;
  const height = Math.round(size / aspect);

  return (
    <View style={{ width: size, height, borderRadius, overflow: "hidden" }}>
      <Image
        source={source}
        style={{ width: size, height }}
        resizeMode="cover"
        accessibilityLabel="TRS — Telangana Rakshana Sena"
      />
    </View>
  );
}
