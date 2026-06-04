import { z } from "zod";

/**
 * Domain enums as zod enums so they double as runtime validators and TS types.
 * Prisma enums mirror these exact string values.
 */

export const OrgUnitType = z.enum(["state", "district", "constituency", "mandal", "booth"]);
export type OrgUnitType = z.infer<typeof OrgUnitType>;

export const Role = z.enum([
  "worker",
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
]);
export type Role = z.infer<typeof Role>;

/** Roles that can see team/management dashboards, in ascending scope. */
export const LEADER_ROLES: Role[] = [
  "booth_leader",
  "mandal_leader",
  "constituency_leader",
  "district_leader",
  "state_admin",
  "hq_admin",
];

export const Tier = z.enum(["karyakarta", "sevak", "pramukh", "nayak", "ratna"]);
export type Tier = z.infer<typeof Tier>;

export const Language = z.enum(["te", "en"]);
export type Language = z.infer<typeof Language>;

export const SocialPlatform = z.enum(["whatsapp", "instagram", "facebook", "youtube", "x"]);
export type SocialPlatform = z.infer<typeof SocialPlatform>;

export const SocialAccountType = z.enum(["personal", "creator", "business"]);
export type SocialAccountType = z.infer<typeof SocialAccountType>;

export const CreativeType = z.enum(["image", "video", "carousel"]);
export type CreativeType = z.infer<typeof CreativeType>;

export const ShareChannel = z.enum([
  "whatsapp_status",
  "whatsapp",
  "instagram_story",
  "instagram_feed",
  "facebook",
  "copy_link",
  "other",
]);
export type ShareChannel = z.infer<typeof ShareChannel>;

export const ReachSource = z.enum(["whatsapp_link", "instagram_insights"]);
export type ReachSource = z.infer<typeof ReachSource>;

export const ConsentPurpose = z.enum([
  "data_processing",
  "social_linking",
  "content_resharing",
  "location",
]);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

export const DeviceTier = z.enum(["low", "mid", "high"]);
export type DeviceTier = z.infer<typeof DeviceTier>;

export const PaymentStatus = z.enum(["created", "pending", "success", "failed"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const GrievanceStatus = z.enum([
  "open",
  "routed",
  "in_progress",
  "resolved",
  "rejected",
]);
export type GrievanceStatus = z.infer<typeof GrievanceStatus>;

export const ScoreReason = z.enum([
  "share",
  "recruit_initial",
  "recruit_bonus",
  "event_checkin",
  "grievance_file",
  "grievance_resolve",
  "streak",
  "decay",
  "fraud_reversal",
]);
export type ScoreReason = z.infer<typeof ScoreReason>;
