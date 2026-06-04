import { z } from "zod";
import {
  CreativeType,
  Language,
  ShareChannel,
  SocialAccountType,
  SocialPlatform,
  ConsentPurpose,
  DeviceTier,
  GrievanceStatus,
} from "./enums";

/** RSVP status a worker can set for an event. */
export const RsvpStatus = z.enum(["going", "maybe", "no"]);
export type RsvpStatus = z.infer<typeof RsvpStatus>;

/** Indian phone: +91XXXXXXXXXX or a bare 10-digit number starting 6-9. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number")
  .transform((v) => (v.startsWith("+91") ? v : `+91${v}`));

export const otpCodeSchema = z.string().trim().regex(/^\d{4,6}$/, "Enter the OTP");

// --- Auth ---
export const requestOtpSchema = z.object({ phone: phoneSchema });
export type RequestOtpDto = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  /** native clients identify themselves so the API returns the refresh token in the body */
  client: z.enum(["web", "native"]).default("web"),
});
export type VerifyOtpDto = z.input<typeof verifyOtpSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

// --- Captions / language variants ---
export const captionVariantsSchema = z.record(Language, z.string().max(2200));
export type CaptionVariants = z.infer<typeof captionVariantsSchema>;

// --- Template designer zones ---
export const templateZoneSchema = z.object({
  id: z.string(),
  kind: z.enum(["photo", "name", "booth", "designation", "logo", "subtitle", "ai_label"]),
  /** normalized 0..1 coordinates relative to the canvas */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  rotation: z.number().default(0),
  fontSize: z.number().optional(),
  color: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  shape: z.enum(["rect", "circle"]).optional(),
});
export type TemplateZone = z.infer<typeof templateZoneSchema>;

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  canvasWidth: z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1920),
  zones: z.array(templateZoneSchema).min(1),
});
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;

// --- Creatives ---
export const createCreativeSchema = z.object({
  title: z.string().min(1),
  type: CreativeType,
  /** key in StorageProvider for the HQ source asset */
  sourceKey: z.string().min(1),
  templateId: z.string().optional(),
  captionVariants: captionVariantsSchema,
  languages: z.array(Language).min(1).default(["te"]),
  /** target org subtree this is published to (null = whole org) */
  targetOrgUnitId: z.string().optional(),
});
export type CreateCreativeDto = z.infer<typeof createCreativeSchema>;

export const publishCreativeSchema = z.object({
  creativeId: z.string(),
  mcmcCertId: z.string().optional(),
});
export type PublishCreativeDto = z.infer<typeof publishCreativeSchema>;

// --- Profile ---
export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  photoKey: z.string().optional(),
  designation: z.string().optional(),
  preferredLanguage: Language.optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// --- Personalized render (reported by device) ---
export const reportRenderSchema = z.object({
  creativeId: z.string(),
  deviceTier: DeviceTier,
  cachedUrl: z.string().optional(),
  /** true when the device could not render and used the server fallback */
  usedServerFallback: z.boolean().default(false),
});
export type ReportRenderDto = z.infer<typeof reportRenderSchema>;

// --- Sharing ---
export const shareIntentSchema = z.object({
  creativeId: z.string(),
  channel: ShareChannel,
});
export type ShareIntentDto = z.infer<typeof shareIntentSchema>;

// --- Social accounts ---
export const connectSocialSchema = z.object({
  platform: SocialPlatform,
  type: SocialAccountType,
});
export type ConnectSocialDto = z.infer<typeof connectSocialSchema>;

// --- Consent (DPDP) ---
export const consentSchema = z.object({
  purpose: ConsentPurpose,
  granted: z.boolean(),
});
export type ConsentDto = z.infer<typeof consentSchema>;

export const ageGateSchema = z.object({
  isAdult: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you are 18 or older" }),
  }),
});

// --- Payments ---
export const startMembershipSchema = z.object({
  amountInr: z.number().int().positive().optional(),
});
export type StartMembershipDto = z.infer<typeof startMembershipSchema>;

// --- Events ---
export const rsvpEventSchema = z.object({
  status: RsvpStatus,
});
export type RsvpEventDto = z.infer<typeof rsvpEventSchema>;

export const checkInEventSchema = z.object({
  /** the event's QR token; in the demo the screen posts the event's own token */
  qrToken: z.string().min(1),
});
export type CheckInEventDto = z.infer<typeof checkInEventSchema>;

// --- Grievances ---
export const createGrievanceSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(2000).optional(),
  citizenName: z.string().max(120).optional(),
  citizenPhone: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
});
export type CreateGrievanceDto = z.infer<typeof createGrievanceSchema>;

/** Admin update of a grievance's workflow status. */
export const updateGrievanceStatusSchema = z.object({
  status: GrievanceStatus,
});
export type UpdateGrievanceStatusDto = z.infer<typeof updateGrievanceStatusSchema>;

// --- Admin: event creation ---
/** ISO datetime accepted as a string; coerced to Date server-side. */
export const createEventSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  /** ISO-8601 timestamp of when the event starts */
  startsAt: z.string().datetime({ offset: true }),
  location: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** org subtree this event belongs to (null = whole org) */
  orgUnitId: z.string().optional(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;

// --- Pagination ---
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PaginationDto = z.infer<typeof paginationSchema>;
