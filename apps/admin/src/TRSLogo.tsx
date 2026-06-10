/**
 * TRSLogo — inline SVG of the TRS party emblem (Next.js admin).
 *
 * SVG fallback until the official PNG is saved. To swap to the real image:
 * drop trs-logo.png (and trs-logo-square.png) into apps/admin/public/ and
 * replace this component body with an <img src="/trs-logo.png" />.
 */

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
  className?: string;
};

const GOLD = "#E8A820";
const NAVY = "#1A3580";
const GREEN = "#2B5216";
const WHITE = "#FFFFFF";

const VW = 100;
const VH_GOLD = 100;
const VH_BANNER = 28;

const TELANGANA_PATH =
  "M28,10 L42,7 L58,6 L72,11 L82,18 L88,28 L86,40 L83,52 L78,62 " +
  "L70,72 L58,82 L48,85 L40,80 L30,72 L22,62 L16,50 L13,38 L18,24 Z";

export function TRSLogo({
  size = 80,
  showBanner = true,
  borderRadius = 6,
  className = "",
}: Props) {
  const totalVH = showBanner ? VH_GOLD + VH_BANNER : VH_GOLD;
  const height = Math.round((size / VW) * totalVH);

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

      <rect x="0" y="0" width={VW} height={VH_GOLD} fill={GOLD} clipPath="url(#trs-gold-clip)" />
      <path d={TELANGANA_PATH} fill={NAVY} clipPath="url(#trs-gold-clip)" />

      <text
        x="50"
        y="62"
        fontSize="26"
        fontWeight="900"
        fill={WHITE}
        stroke={NAVY}
        strokeWidth="2"
        strokeLinejoin="round"
        textAnchor="middle"
        clipPath="url(#trs-gold-clip)"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        TRS
      </text>

      {showBanner && (
        <>
          <rect
            x="0"
            y={VH_GOLD}
            width={VW}
            height={VH_BANNER}
            fill={GREEN}
            clipPath="url(#trs-total-clip)"
          />
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
