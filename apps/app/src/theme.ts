import { Platform } from "react-native";

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
  // Official TRS party emblem palette (Telangana Rakshana Sena)
  trsGold: "#E8A820",   // golden-yellow logo background
  trsNavy: "#1A3580",   // dark-blue Telangana map silhouette
  trsGreen: "#2B5216",  // dark-green bottom banner
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

/**
 * Explicit font family — never rely on system defaults.
 * Web: full CSS stack; iOS: SF Pro via -apple-system; Android: Roboto.
 */
export const fontFamily = Platform.select({
  web: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ios: "System",
  android: "Roboto",
  default: "System",
}) as string;

/**
 * Line-height helper — always 1.4× the font size, rounded to nearest integer.
 * Use in every Text style: lineHeight: lh(fontSize).
 */
export const lh = (fontSize: number): number => Math.round(fontSize * 1.4);
