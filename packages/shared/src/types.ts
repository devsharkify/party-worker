import type {
  CreativeType,
  Language,
  OrgUnitType,
  Role,
  SocialAccountType,
  SocialPlatform,
  Tier,
  DeviceTier,
  ConsentPurpose,
  GrievanceStatus,
} from "./enums";
import type { TemplateZone, CaptionVariants, RsvpStatus } from "./schemas";

/** Public shape of a user returned to clients (no secrets). */
export interface UserPublic {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  designation: string | null;
  constituency: string | null;
  area: string | null;
  role: Role;
  tier: Tier;
  orgUnitId: string;
  orgUnitName: string;
  boothName: string | null;
  preferredLanguage: Language;
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  membershipActive: boolean;
  /** true if this role can see team dashboards */
  isLeader: boolean;
}

export interface AuthResult {
  accessToken: string;
  /** present only for native clients; web receives it as an httpOnly cookie */
  refreshToken?: string;
  user: UserPublic;
}

export interface OrgUnitNode {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  childrenCount: number;
  memberCount: number;
}

/** A member row shown in a leader's team / org-unit roster. */
export interface OrgMemberRow {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  role: Role;
  tier: Tier;
  designation: string | null;
  orgUnitId: string;
  orgUnitName: string;
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  membershipActive: boolean;
  isLeader: boolean;
}

/** Result of onboarding a member into the hierarchy. */
export interface OnboardResult {
  member: OrgMemberRow;
  /** points credited to the recruiter for growing the network */
  recruiterPointsAwarded: number;
}

export interface MembershipCard {
  userId: string;
  name: string;
  photoUrl: string | null;
  designation: string | null;
  boothName: string | null;
  tier: Tier;
  tierLabel: { te: string; en: string };
  /** payload encoded into the card QR */
  qrPayload: string;
  membershipActive: boolean;
}

export interface FeedItem {
  creativeId: string;
  title: string;
  type: CreativeType;
  sourceUrl: string;
  thumbnailUrl: string | null;
  templateId: string | null;
  captionVariants: CaptionVariants;
  aiLabeled: boolean;
  mcmcCertified: boolean;
  publishedAt: string;
  /** the viewer's cached personalized render, if already produced */
  personalizedUrl: string | null;
  /** cached personalized video render (webm/mp4), if captured on web */
  personalizedVideoUrl: string | null;
  /** seconds; only for type=video */
  videoDurationSec: number | null;
  isNew: boolean;
  /** pinned to top of feed for 24 h after publish — rapid-response content */
  isBreaking: boolean;
  orgUnitName: string | null;
  createdAt: string;
}

export interface RenderTemplate {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  zones: TemplateZone[];
}

export interface PersonalizedRenderInfo {
  creativeId: string;
  userId: string;
  deviceTier: DeviceTier;
  cachedUrl: string | null;
  usedServerFallback: boolean;
}

export interface ShareResult {
  shareEventId: string;
  /** the unique tracked link to place in the caption */
  trackedLink: string;
  caption: string;
  /** base points already credited for this creative (0 until a share is confirmed) */
  basePointsAwarded: number;
  /** the worker's personalized render of this creative, when one exists */
  personalizedUrl: string | null;
  /** original creative media — the share fallback when no render exists */
  mediaUrl: string;
  /** 'image' | 'video' — drives on-device banner compositing logic */
  type: CreativeType;
}

export interface ShareConfirmResult {
  /** base points credited by this confirmation (0 on repeat shares) */
  pointsAwarded: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  photoUrl: string | null;
  tier: Tier;
  points: number;
  isViewer: boolean;
  isVerified?: boolean;
}

export interface LeaderboardView {
  level: OrgUnitType;
  orgUnitId: string;
  orgUnitName: string;
  viewerRank: number | null;
  entries: LeaderboardEntry[];
}

export interface PoolView {
  poolId: string;
  weekStart: string;
  size: number;
  promoteTop: number;
  demoteBottom: number;
  viewerRank: number | null;
  entries: LeaderboardEntry[];
}

export interface ScoreSummary {
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  tier: Tier;
  nextTier: Tier | null;
  pointsToNextTier: number;
  streakDays: number;
  ranks: Partial<Record<OrgUnitType, number>>;
}

export interface SocialAccountInfo {
  id: string;
  platform: SocialPlatform;
  type: SocialAccountType;
  connected: boolean;
  handle: string | null;
  isPrimary: boolean;
  /** false for personal/unconnected => base points only */
  insightsAvailable: boolean;
}

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: string | null;
}

export interface GrievanceSummary {
  id: string;
  title: string;
  status: GrievanceStatus;
  createdAt: string;
  description: string | null;
  citizenName: string | null;
  citizenPhone: string | null;
  location: string | null;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
}

/** Anonymized grievance from the same org subtree — no citizen contact info. */
export interface AreaGrievanceSummary {
  id: string;
  title: string;
  status: GrievanceStatus;
  createdAt: string;
  description: string | null;
  location: string | null;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  orgUnitName: string;
}

/** An upcoming event, with the viewer's own RSVP/check-in state. */
export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  /** the event's QR token (used by the demo check-in button) */
  qrToken: string;
  orgUnitId: string | null;
  /** the viewer's RSVP, if any */
  rsvpStatus: RsvpStatus | null;
  /** whether the viewer has already checked in */
  checkedIn: boolean;
}

/** Result of POST /events/:id/rsvp. */
export interface RsvpResult {
  eventId: string;
  status: RsvpStatus;
}

/** Result of POST /events/:id/checkin. */
export interface CheckInResult {
  checkedIn: boolean;
  /** points credited for this check-in (0 if already checked in) */
  pointsAwarded: number;
}

/** A timed "Trend Alert" mission visible to workers. */
export interface MissionView {
  id: string;
  title: string;
  caption: string | null;
  hashtag: string | null;
  bonusPoints: number;
  startsAt: string;
  endsAt: string;
  creativeId: string | null;
  completedByViewer: boolean;
  completionCount: number;
}

/** One row in the leader attendance list for an event. */
export interface AttendanceRow {
  userId: string;
  name: string;
  photoUrl: string | null;
  checkedInAt: string;
  /** whether geo-fence was satisfied when checking in */
  verified: boolean;
  /** distance from venue in metres, null when event has no coordinates */
  distanceMetres: number | null;
}

/** Result of POST /grievances. */
export interface GrievanceCreated {
  id: string;
  title: string;
  status: GrievanceStatus;
  createdAt: string;
  /** points credited for filing (0 if none) */
  pointsAwarded: number;
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

/** A single top-performer row on the admin dashboard. */
export interface AdminTopPerformer {
  userId: string;
  name: string;
  tier: Tier;
  weeklyLeaguePoints: number;
}

/** Aggregate numbers for GET /admin/stats. */
export interface AdminStats {
  /** total worker-role users */
  workers: number;
  /** users with an active membership */
  membersActive: number;
  creativesTotal: number;
  creativesPublished: number;
  /** published creatives that carry an MCMC certificate */
  mcmcCertified: number;
  totalShares: number;
  /** sum of ReachEvent.uniqueCount across all shares */
  totalReach: number;
  grievances: Record<GrievanceStatus, number> & {
    open: number;
    inProgress: number;
    resolved: number;
  };
  events: number;
  topPerformers: AdminTopPerformer[];
}

/** A grievance row for the admin queue (GET /admin/grievances). */
export interface AdminGrievanceRow {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  citizenName: string | null;
  citizenPhone: string | null;
  location: string | null;
  status: GrievanceStatus;
  createdAt: string;
  /** the worker who filed it */
  filedByName: string;
  /** the filing worker's booth (their org unit name) */
  boothName: string | null;
}

/** Result of admin scoring-maintenance endpoints. */
export interface MaintenanceResult {
  affected: number;
}

// ---------------------------------------------------------------------------
// Admin people management
// ---------------------------------------------------------------------------

/** Full user row for the admin People tab. */
export interface AdminUserRow {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  role: Role;
  tier: Tier;
  designation: string | null;
  orgUnitId: string;
  orgUnitName: string;
  orgUnitType: OrgUnitType;
  isLeader: boolean;
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  membershipActive: boolean;
  createdAt: string;
}


/**
 * Creative row shown in the admin Studio section.
 * Includes draft + published creatives with all management fields.
 */
export interface AdminCreativeRow {
  id: string;
  title: string;
  type: CreativeType;
  published: boolean;
  publishedAt: string | null;
  mcmcCertified: boolean;
  mcmcCertId: string | null;
  aiLabeled: boolean;
  sourceKey: string;
  /** Resolved public URL of the source file (served by storage provider). */
  sourceUrl?: string;
  captionVariants: CaptionVariants;
  languages: string[];
  targetOrgUnitId: string | null;
  videoDurationSec: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Worker skill profile
// ---------------------------------------------------------------------------

export interface WorkerProfileView {
  userId: string;
  skills: string[];
  languages: string[];
  availability: string;
  bio: string | null;
  updatedAt: string;
}

/** A row returned from the admin skills-search endpoint. */
export interface WorkerSkillRow {
  userId: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  role: Role;
  orgUnitId: string;
  orgUnitName: string;
  skills: string[];
  languages: string[];
  availability: string;
  bio: string | null;
}

/** A news item shown in the worker app */
export interface NewsItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
}
