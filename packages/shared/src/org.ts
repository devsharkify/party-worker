import type { OrgUnitType, Role } from "./enums";

/** Org hierarchy, top to bottom. */
export const ORG_LEVELS: OrgUnitType[] = ["state", "district", "constituency", "mandal", "booth"];

/** The leader role that heads each org-unit level. */
export const LEADER_ROLE_BY_TYPE: Record<OrgUnitType, Role> = {
  state: "state_admin",
  district: "district_leader",
  constituency: "constituency_leader",
  mandal: "mandal_leader",
  booth: "booth_leader",
};

/** Human label for each org level (en). */
export const ORG_TYPE_LABEL: Record<OrgUnitType, string> = {
  state: "State",
  district: "District",
  constituency: "Constituency",
  mandal: "Mandal",
  booth: "Booth",
};

/** The org-unit type one level below the given type (null for booth, the leaf). */
export function childTypeOf(type: OrgUnitType): OrgUnitType | null {
  const i = ORG_LEVELS.indexOf(type);
  return i >= 0 && i < ORG_LEVELS.length - 1 ? (ORG_LEVELS[i + 1] as OrgUnitType) : null;
}

/** Ascending authority rank; higher = wider scope. */
export const ROLE_RANK: Record<Role, number> = {
  worker: 0,
  booth_leader: 1,
  mandal_leader: 2,
  constituency_leader: 3,
  district_leader: 4,
  state_admin: 5,
  hq_admin: 6,
};

/**
 * Roles a given actor may assign when onboarding members: always `worker`, plus any
 * leader role strictly below their own rank. `hq_admin` is never assignable via onboarding.
 */
export function assignableRoles(actorRole: Role): Role[] {
  const max = ROLE_RANK[actorRole];
  return (Object.keys(ROLE_RANK) as Role[]).filter(
    (r) => r !== "hq_admin" && (r === "worker" || ROLE_RANK[r] < max),
  );
}

/** Is a leader role appropriate for an org unit of this type? (workers fit anywhere) */
export function roleFitsUnit(role: Role, unitType: OrgUnitType): boolean {
  if (role === "worker") return true;
  if (role === "hq_admin") return false;
  return LEADER_ROLE_BY_TYPE[unitType] === role;
}
