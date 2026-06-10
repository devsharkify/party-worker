/**
 * TRSLogo — official TRS party emblem (Next.js admin, real PNG asset).
 *
 * Asset: apps/admin/public/trs-logo.png (820x1046, gold field + blue
 * Telangana map with TRS + green name band). Square variant rendered by
 * cropping via aspect-ratio when showBanner is false.
 */

type Props = {
  size?: number;
  showBanner?: boolean;
  borderRadius?: number;
  className?: string;
};

const FULL_W = 820;
const FULL_H = 1046;
const GOLD_H = 886; // height of the gold panel (without the green band)

export function TRSLogo({
  size = 80,
  showBanner = true,
  borderRadius = 6,
  className = "",
}: Props) {
  const ratio = (showBanner ? FULL_H : GOLD_H) / FULL_W;
  const height = Math.round(size * ratio);

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height,
        borderRadius,
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/trs-logo.png"
        alt="TRS — Telangana Rakshana Sena"
        width={size}
        height={Math.round(size * (FULL_H / FULL_W))}
        style={{ display: "block", width: size, height: "auto" }}
      />
    </span>
  );
}
