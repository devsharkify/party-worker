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
import type { TemplateZone, CaptionVariants } from "./schemas";

/** Public shape of a user returned to clients (no secrets). */
export interface UserPublic {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  designation: string | null;
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
  isNew: boolean;
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
  /** points credited immediately for the share intent (base) */
  basePointsAwarded: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  photoUrl: string | null;
  tier: Tier;
  points: number;
  isViewer: boolean;
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
  platform: SocialPlatform;
  type: SocialAccountType;
  connected: boolean;
  handle: string | null;
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
  photoUrl: string | null;
}
