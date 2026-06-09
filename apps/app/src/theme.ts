export const colors = {
  bg: "#FFFFFF",
  bgElevated: "#FFF0F8",
  bgDeep: "#FCE4F2",
  card: "#FFFFFF",
  cardMuted: "#FFF5FB",
  // TRS/BRS brand: magenta-pink primary
  primary: "#E91E8C",
  primaryDark: "#AD1066",
  primarySoft: "#FCE4F2",
  navy: "#1a1a2e",
  navyDark: "#0f0f1a",
  green: "#16a34a",
  gold: "#FFB300",
  text: "#1a1a2e",
  textOnDark: "#FFFFFF",
  textMuted: "#64748b",
  textMutedOnDark: "#f0b8d9",
  border: "#F0D4E8",
  borderOnDark: "#3a2040",
  danger: "#EF4444",
  success: "#16a34a",
  skeleton: "#F5E0EE",
  skeletonOnDark: "#3a2040",
};

export const tierColor: Record<string, string> = {
  karyakarta: "#94a3b8",
  sevak: "#38bdf8",
  pramukh: "#a78bfa",
  nayak: "#fb923c",
  ratna: "#FFB300",
};

/** Subtle tint of a tier color for backgrounds. */
export const tint = (hex: string, alpha = "22") => hex + alpha;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const space = (n: number) => n * 4;

/** Soft, brand-consistent shadow that degrades gracefully on web + native. */
export const shadow = {
  shadowColor: "#E91E8C",
  shadowOpacity: 0.10,
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
