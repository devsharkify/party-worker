import type { CreativeType, Tier } from "@prisma/client";

/**
 * One published creative's aggregate performance: how many times workers shared
 * it, the total verified unique reach it drove, and how many personalized
 * renders were produced for it.
 */
export interface ContentPerformanceRow {
  creativeId: string;
  title: string;
  type: CreativeType;
  shares: number;
  reach: number;
  renders: number;
}

/**
 * A top "amplifier" — a worker ranked by the total verified reach generated
 * across all of their share events.
 */
export interface TopAmplifierRow {
  userId: string;
  name: string;
  tier: Tier;
  reach: number;
  shares: number;
}
