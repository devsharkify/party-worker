/**
 * TRSLogo — pixel-accurate SVG representation of the official TRS party emblem.
 *
 * Brand palette extracted from the official logo:
 *   Gold   #E8A820  background
 *   Navy   #1A3580  Telangana map silhouette + TRS text outline
 *   Green  #2B5216  bottom banner
 *   White  #FFFFFF  TRS lettering + banner text
 *
 * Props:
 *   size        — width in dp; height is auto-calculated by aspect ratio
 *   showBanner  — include the dark-green "Telangana Rakshana Sena" strip (default true)
 *   borderRadius — clip the gold panel corners (default 6)
 */

import React from "react";
import Svg, {
  ClipPath,
  Defs,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

// ─── brand constants ────────────────────────────────────────────────────────
const GOLD  = "#E8A820";
const NAVY  = "#1A3580";
const GREEN = "#2B5216";
const WHITE = "#FFFFFF";

// SVG canvas: 100 wide × 128 tall (100 gold panel + 28 green banner)
const VW = 100;
const VH_GOLD   = 100;
const VH_BANNER = 28;
const VH_TOTAL  = VH_GOLD + VH_BANNER;

/**
 * Simplified Telangana state silhouette — hand-traced polygon that captures
 * the distinctive wider-north, tapering-south shape of the state.
 */
const TELANGANA_PATH =
  "M24,12 L36,7 L52,6 L67,9 L78,17 L84,30 L86,44 " +
  "L83,57 L77,68 L67,77 L54,83 L41,83 L28,77 L18,67 " +
  "L12,54 L11,40 L15,26 Z";

// ─── component ──────────────────────────────────────────────────────────────
type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
};

export function TRSLogo({ size = 80, showBanner = true, borderRadius = 6 }: Props) {
  const totalVH = showBanner ? VH_TOTAL : VH_GOLD;
  const height  = (size / VW) * totalVH;

  return (
    <Svg
      width={size}
      height={height}
      viewBox={`0 0 ${VW} ${totalVH}`}
    >
      <Defs>
        <ClipPath id="goldClip">
          <Rect
            x="0" y="0"
            width={VW} height={VH_GOLD}
            rx={borderRadius} ry={borderRadius}
          />
        </ClipPath>
        <ClipPath id="totalClip">
          <Rect
            x="0" y="0"
            width={VW} height={totalVH}
            rx={borderRadius} ry={borderRadius}
          />
        </ClipPath>
      </Defs>

      {/* ── gold background ─────────────────────────────────── */}
      <Rect
        x="0" y="0"
        width={VW} height={VH_GOLD}
        fill={GOLD}
        clipPath="url(#goldClip)"
      />

      {/* ── Telangana map silhouette ─────────────────────────── */}
      <Path
        d={TELANGANA_PATH}
        fill={NAVY}
        clipPath="url(#goldClip)"
      />

      {/* ── "TRS" lettering ──────────────────────────────────── */}
      {/* stroke painted first so the fill sits on top (paintOrder) */}
      <SvgText
        x="49"
        y="63"
        fontSize="30"
        fontWeight="900"
        fill={WHITE}
        stroke={NAVY}
        strokeWidth="2.5"
        strokeLinejoin="round"
        textAnchor="middle"
        clipPath="url(#goldClip)"
      >
        TRS
      </SvgText>

      {/* ── green banner ─────────────────────────────────────── */}
      {showBanner && (
        <>
          <Rect
            x="0" y={VH_GOLD}
            width={VW} height={VH_BANNER}
            fill={GREEN}
            clipPath="url(#totalClip)"
          />

          {/* Telugu script */}
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

          {/* English name */}
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
