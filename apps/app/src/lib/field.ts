/**
 * Field duty module — shared types + helpers.
 * Mirrors the /field/* API contract exactly.
 */

/** GET /field/me */
export interface FieldMe {
  onDuty: boolean;
  updatedAt: string | null;
}

/** GET /field/team — one team member row (leader/admin only). */
export interface FieldTeamMember {
  userId: string;
  name: string;
  role: string;
  phone: string | null;
  unitName: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  onDuty: boolean;
  updatedAt: string | null;
}

/** A live-position update is considered fresh for this long. */
export const FRESH_WINDOW_MS = 3 * 60 * 1000;

/** Re-post the live position this often while duty is ON. */
export const DUTY_PING_INTERVAL_MS = 60 * 1000;

/** True when the timestamp is within the freshness window. */
export function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= FRESH_WINDOW_MS;
}

/**
 * Short relative time — "2 నిమిషాల క్రితం" / "2 min ago" style.
 * Falls back to a dash for missing timestamps.
 */
export function timeAgo(iso: string | null | undefined, lang: "te" | "en"): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return lang === "te" ? "ఇప్పుడే" : "just now";
  if (mins < 60) return lang === "te" ? `${mins} నిమిషాల క్రితం` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "te" ? `${hours} గంటల క్రితం` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return lang === "te" ? `${days} రోజుల క్రితం` : `${days} d ago`;
}
