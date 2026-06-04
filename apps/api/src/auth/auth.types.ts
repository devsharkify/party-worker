import type { Role } from "@pw/shared";

export interface AuthUser {
  id: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
  typ: "refresh";
}

export const REFRESH_COOKIE = "pw_refresh";
