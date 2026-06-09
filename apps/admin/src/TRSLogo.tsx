/**
 * TRSLogo — inline SVG of the official TRS party emblem for the Next.js admin.
 *
 * Brand palette:
 *   Gold   #E8A820  background
 *   Navy   #1A3580  Telangana map silhouette + TRS stroke
 *   Green  #2B5216  bottom banner
 *   White  #FFFFFF  TRS lettering + banner text
 */

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
  className?: string;
};

const GOLD  = "#E8A820";
const NAVY  = "#1A3580";
const GREEN = "#2B5216";
const WHITE = "#FFFFFF";

const VW       = 100;
const VH_GOLD  = 100;
const VH_BANNER = 28;

const TELANGANA_PATH =
  "M24,12 L36,7 L52,6 L67,9 L78,17 L84,30 L86,44 " +
  "L83,57 L77,68 L67,77 L54,83 L41,83 L28,77 L18,67 " +
  "L12,54 L11,40 L15,26 Z";

export function TRSLogo({ size = 80, showBanner = true, borderRadius = 6, className = "" }: Props) {
  const totalVH = showBanner ? VH_GOLD + VH_BANNER : VH_GOLD;
  const height  = Math.round((size / VW) * totalVH);

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VW} ${totalVH}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="TRS — Telangana Rakshana Sena"
    >
      <defs>
        <clipPath id="trs-gold-clip">
          <rect x="0" y="0" width={VW} height={VH_GOLD} rx={borderRadius} ry={borderRadius} />
        </clipPath>
        <clipPath id="trs-total-clip">
          <rect x="0" y="0" width={VW} height={totalVH} rx={borderRadius} ry={borderRadius} />
        </clipPath>
      </defs>

      {/* Gold background */}
      <rect x="0" y="0" width={VW} height={VH_GOLD} fill={GOLD} clipPath="url(#trs-gold-clip)" />

      {/* Telangana map silhouette */}
      <path d={TELANGANA_PATH} fill={NAVY} clipPath="url(#trs-gold-clip)" />

      {/* TRS lettering */}
      <text
        x="49"
        y="63"
        fontSize="30"
        fontWeight="900"
        fill={WHITE}
        stroke={NAVY}
        strokeWidth="2.5"
        strokeLinejoin="round"
        textAnchor="middle"
        clipPath="url(#trs-gold-clip)"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        TRS
      </text>

      {showBanner && (
        <>
          {/* Green banner */}
          <rect x="0" y={VH_GOLD} width={VW} height={VH_BANNER} fill={GREEN} clipPath="url(#trs-total-clip)" />

          {/* Telugu name */}
          <text
            x="50"
            y={VH_GOLD + 11}
            fontSize="7.5"
            fontWeight="700"
            fill={WHITE}
            textAnchor="middle"
            clipPath="url(#trs-total-clip)"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            తెలంగాణ రక్షణ సేన
          </text>

          {/* English name */}
          <text
            x="50"
            y={VH_GOLD + 22}
            fontSize="5.8"
            fontWeight="600"
            fill={WHITE}
            textAnchor="middle"
            letterSpacing="0.8"
            clipPath="url(#trs-total-clip)"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            TELANGANA RAKSHANA SENA
          </text>
        </>
      )}
    </svg>
  );
}
