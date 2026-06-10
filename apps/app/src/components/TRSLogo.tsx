/**
 * TRSLogo — official TRS party emblem (real PNG assets).
 *
 * Assets (generated from the accurate Telangana outline, matching the
 * official flag: gold field + blue map with TRS + green name band):
 *   apps/app/assets/trs-logo.png         820x1046  (gold + green banner)
 *   apps/app/assets/trs-logo-square.png  820x886   (gold panel only)
 */

import React from "react";
import { Image } from "react-native";

const LOGO_FULL = require("../../assets/trs-logo.png");
const LOGO_SQUARE = require("../../assets/trs-logo-square.png");

const FULL_RATIO = 1046 / 820;
const SQUARE_RATIO = 886 / 820;

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
};

export function TRSLogo({ size = 80, showBanner = true, borderRadius = 6 }: Props) {
  const ratio = showBanner ? FULL_RATIO : SQUARE_RATIO;
  return (
    <Image
      source={showBanner ? LOGO_FULL : LOGO_SQUARE}
      style={{ width: size, height: size * ratio, borderRadius }}
      resizeMode="contain"
      accessibilityLabel="TRS — Telangana Rakshana Sena"
    />
  );
}
