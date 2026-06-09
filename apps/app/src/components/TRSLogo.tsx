/**
 * TRSLogo — SVG fallback rendering of the TRS party emblem.
 *
 * To swap in the official PNG instead of this SVG:
 *   1. Save the logo PNGs to:
 *        apps/app/assets/trs-logo.png         (gold + green banner)
 *        apps/app/assets/trs-logo-square.png  (gold panel only)
 *   2. Replace the body of this component with the Image-based version.
 */

import React from "react";
import Svg, { ClipPath, Defs, Path, Rect, Text as SvgText } from "react-native-svg";

const GOLD = "#E8A820";
const NAVY = "#1A3580";
const GREEN = "#2B5216";
const WHITE = "#FFFFFF";

const VW = 100;
const VH_GOLD = 100;
const VH_BANNER = 28;

// Stylized Telangana silhouette — distinct shape (wider north, pointed south,
// notched west). Not pixel-accurate; swap for the real PNG when available.
const TELANGANA_PATH =
  "M28,10 L42,7 L58,6 L72,11 L82,18 L88,28 L86,40 L83,52 L78,62 " +
  "L70,72 L58,82 L48,85 L40,80 L30,72 L22,62 L16,50 L13,38 L18,24 Z";

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
};

export function TRSLogo({ size = 80, showBanner = true, borderRadius = 6 }: Props) {
  const totalVH = showBanner ? VH_GOLD + VH_BANNER : VH_GOLD;
  const height = (size / VW) * totalVH;

  return (
    <Svg width={size} height={height} viewBox={`0 0 ${VW} ${totalVH}`}>
      <Defs>
        <ClipPath id="goldClip">
          <Rect x="0" y="0" width={VW} height={VH_GOLD} rx={borderRadius} ry={borderRadius} />
        </ClipPath>
        <ClipPath id="totalClip">
          <Rect x="0" y="0" width={VW} height={totalVH} rx={borderRadius} ry={borderRadius} />
        </ClipPath>
      </Defs>

      <Rect x="0" y="0" width={VW} height={VH_GOLD} fill={GOLD} clipPath="url(#goldClip)" />
      <Path d={TELANGANA_PATH} fill={NAVY} clipPath="url(#goldClip)" />

      <SvgText
        x="50"
        y="62"
        fontSize="26"
        fontWeight="900"
        fill={WHITE}
        stroke={NAVY}
        strokeWidth="2"
        strokeLinejoin="round"
        textAnchor="middle"
        clipPath="url(#goldClip)"
      >
        TRS
      </SvgText>

      {showBanner && (
        <>
          <Rect x="0" y={VH_GOLD} width={VW} height={VH_BANNER} fill={GREEN} clipPath="url(#totalClip)" />
          <SvgText
            x="50"
            y={VH_GOLD + 11}
            fontSize="7.5"
            fontWeight="700"
            fill={WHITE}
            textAnchor="middle"
            clipPath="url(#totalClip)"
          >
            తెలంగాణ రక్షణ సేన
          </SvgText>
          <SvgText
            x="50"
            y={VH_GOLD + 22}
            fontSize="5.8"
            fontWeight="600"
            fill={WHITE}
            textAnchor="middle"
            letterSpacing="0.8"
            clipPath="url(#totalClip)"
          >
            TELANGANA RAKSHANA SENA
          </SvgText>
        </>
      )}
    </Svg>
  );
}
