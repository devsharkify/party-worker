/**
 * TRSLogo — uses the official TRS party emblem image (Next.js admin).
 *
 * The image must be placed at:
 *   apps/admin/public/trs-logo.png         — full emblem (gold + green banner)
 *   apps/admin/public/trs-logo-square.png  — square gold panel only (no banner)
 *
 * If trs-logo-square.png is missing the browser will show a broken image; the
 * full logo always renders correctly.
 */

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
  className?: string;
};

const ASPECT_FULL   = 100 / 128;  // gold + green banner
const ASPECT_SQUARE = 1;          // gold panel only

export function TRSLogo({
  size = 80,
  showBanner = true,
  borderRadius = 6,
  className = "",
}: Props) {
  const src    = showBanner ? "/trs-logo.png" : "/trs-logo-square.png";
  const aspect = showBanner ? ASPECT_FULL : ASPECT_SQUARE;
  const height = Math.round(size / aspect);

  return (
    <img
      src={src}
      width={size}
      height={height}
      alt="TRS — Telangana Rakshana Sena"
      className={className}
      style={{
        width: size,
        height,
        objectFit: "contain",
        borderRadius,
        display: "block",
      }}
    />
  );
}
