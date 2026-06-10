import { Platform } from "react-native";

/**
 * myTRS design system — TRS official brand palette.
 *
 *   Navy   #1A3580   primary  — header, primary actions, key text
 *   Gold   #E8A820   accent   — hero CTAs, badges, highlights, active states
 *   Green  #2B5216   tertiary — success, supporting accents
 *
 * Naming convention preserved so existing screen code keeps working —
 * `primary` is now navy (not pink). Every reference in the app inherits
 * the new palette automatically.
 */

export const colors = {
  // Surfaces — warm off-white for premium feel, pure white for cards
  bg: "#FAFAF5",
  bgElevated: "#FFFFFF",
  bgDeep: "#F4EFE0",
  card: "#FFFFFF",
  cardMuted: "#F7F3E8",

  // Primary brand: NAVY
  primary: "#1A3580",
  primaryDark: "#0F1F4E",
  primarySoft: "#E8EDF7",

  // Accent: GOLD
  gold: "#E8A820",
  goldDark: "#B8841A",
  goldSoft: "#FCF2D9",

  // Tertiary: GREEN
  green: "#2B5216",
  greenSoft: "#E6EFD7",

  // Aliases used by some legacy components
  navy: "#0F1F4E",
  navyDark: "#0A1535",

  // Official TRS emblem palette (used by TRSLogo + banner)
  trsGold: "#E8A820",
  trsNavy: "#1A3580",
  trsGreen: "#2B5216",

  // Text
  text: "#0F1F4E",
  textOnDark: "#FFFFFF",
  textMuted: "#5A6378",
  textMutedOnDark: "#B8C2DA",

  // Borders + neutrals
  border: "#E2E5EE",
  borderOnDark: "#2A4A8E",

  // Semantic
  danger: "#DC2626",
  success: "#16A34A",

  // Skeleton loading states
  skeleton: "#EEF0F5",
  skeletonOnDark: "#2A4A8E",
};

export const tierColor: Record<string, string> = {
  karyakarta: "#94a3b8",
  sevak: "#38bdf8",
  pramukh: "#a78bfa",
  nayak: "#fb923c",
  ratna: "#E8A820",
};

/** Subtle tint of a tier color for backgrounds. */
export const tint = (hex: string, alpha = "22") => hex + alpha;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const space = (n: number) => n * 4;

/**
 * Soft, brand-consistent shadow — navy-tinted so it reads as premium
 * rather than the previous pink halo.
 */
export const shadow = {
  shadowColor: "#0F1F4E",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;

/** Stronger shadow for hero CTAs and floating elements. */
export const shadowLg = {
  shadowColor: "#0F1F4E",
  shadowOpacity: 0.16,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

export const fontWeight = {
  regular: "500",
  semibold: "600",
  bold: "700",
  heavy: "700",
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
