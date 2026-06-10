/**
 * TRSLogo — the official TRS party emblem (real uploaded artwork).
 *
 * Assets (in public/):
 *   /trs-logo.png        — full emblem: gold panel + green banner (820×1066)
 *   /trs-logo-square.png — gold panel only, square crop (for headers)
 */

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
  className?: string;
};

const ASPECT_FULL = 820 / 1066;
const ASPECT_SQUARE = 1;

export function TRSLogo({
  size = 80,
  showBanner = true,
  borderRadius = 6,
  className = "",
}: Props) {
  const src = showBanner ? "/trs-logo.png" : "/trs-logo-square.png";
  const aspect = showBanner ? ASPECT_FULL : ASPECT_SQUARE;
  const height = Math.round(size / aspect);

  return (
    <img
      src={src}
      width={size}
      height={height}
      alt="TRS — Telangana Rakshana Sena"
      className={className}
      style={{ width: size, height, objectFit: "cover", borderRadius, display: "block" }}
    />
  );
}
