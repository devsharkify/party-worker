export const colors = {
  bg: "#0b1f3a",
  bgElevated: "#13294d",
  bgDeep: "#081628",
  card: "#ffffff",
  cardMuted: "#f1f5f9",
  primary: "#ff9933", // saffron
  primaryDark: "#e07a1f",
  primarySoft: "#fff4e6",
  green: "#138808",
  text: "#0f172a",
  textOnDark: "#ffffff",
  textMuted: "#64748b",
  textMutedOnDark: "#9fb3d1",
  border: "#e2e8f0",
  borderOnDark: "#22406b",
  gold: "#ffd54a",
  danger: "#dc2626",
  success: "#16a34a",
  skeleton: "#e2e8f0",
  skeletonOnDark: "#1c365e",
};

export const tierColor: Record<string, string> = {
  karyakarta: "#94a3b8",
  sevak: "#38bdf8",
  pramukh: "#a78bfa",
  nayak: "#fb923c",
  ratna: "#ffd54a",
};

/** Subtle tint of a tier color for backgrounds. */
export const tint = (hex: string, alpha = "22") => hex + alpha;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const space = (n: number) => n * 4;

/** Soft, brand-consistent shadow that degrades gracefully on web + native. */
export const shadow = {
  shadowColor: "#0b1f3a",
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
} as const;

export const fontWeight = {
  regular: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;
