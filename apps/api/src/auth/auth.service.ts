import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@pw/shared";
import { APP_ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { OTP_PROVIDER, type OtpProvider } from "../providers/otp.provider";
import { genOtpCode, newId, sha256 } from "./crypto.util";
import type { RefreshTokenPayload } from "./auth.types";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /**
   * Demo/QA conveniences — DISABLED in production.
   * Active only when ALLOW_TEST_LOGINS=true (never set in prod). This guards
   * both the hardcoded admin bypass and the +91900000… test-number range so a
   * real deployment cannot be entered without a genuine SMS OTP.
   */
  private get testLoginsAllowed(): boolean {
    return this.env.ALLOW_TEST_LOGINS === "true";
  }
  private readonly ADMIN_BYPASS_PHONE = "+919999999991";
  private readonly ADMIN_BYPASS_OTP = "999999";

  private isAdminBypass(phone: string) {
    if (!this.testLoginsAllowed) return false;
    // Match with or without +91 prefix
    const normalized = phone.startsWith("+91") ? phone : `+91${phone}`;
    return normalized === this.ADMIN_BYPASS_PHONE;
  }

  async requestOtp(phone: string): Promise<{ sent: true; devHint?: string }> {
    // Hardcoded admin bypass (demo only)
    if (this.isAdminBypass(phone)) {
      await this.prisma.otpChallenge.create({
        data: {
          phone,
          codeHash: sha256(this.ADMIN_BYPASS_OTP),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
      return { sent: true, devHint: this.env.OTP_PROVIDER === "fake" ? this.ADMIN_BYPASS_OTP : undefined };
    }

    // Demo/test numbers (and fake mode) skip real SMS and accept the dev code —
    // ONLY when test logins are explicitly enabled. In production every number
    // goes through the real OTP provider.
    const isTestNumber =
      this.env.OTP_PROVIDER === "fake" ||
      (this.testLoginsAllowed && phone.startsWith(this.env.OTP_BYPASS_PREFIX));

    // Per-phone hourly throttle protects against targeting one real number with
    // SMS spam (cost + nuisance). Test numbers send no SMS, so they're exempt —
    // otherwise shared-IP demos / booth offices would lock themselves out.
    if (!isTestNumber) {
      const since = new Date(Date.now() - 3600_000);
      const recent = await this.prisma.otpChallenge.count({
        where: { phone, createdAt: { gte: since } },
      });
      if (recent >= 5) {
        throw new HttpException(
          "Too many OTP requests. Please try again later.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = isTestNumber ? this.env.DEV_OTP_CODE : genOtpCode();

    await this.prisma.otpChallenge.create({
      data: { phone, codeHash: sha256(code), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    /**
     * Dispatch the OTP via the configured provider.
     * - OTP_PROVIDER=authkey  → Authkey.io SMS
     * - OTP_PROVIDER=whatsapp → Meta WhatsApp Business Cloud API; if the API
     *   call fails the provider logs the error and returns without throwing,
     *   so the challenge record is still saved and the user can retry.
     *   Fallback logic (e.g. SMS after WhatsApp failure) lives inside the
     *   provider itself — this call site does not need to change.
     * - OTP_PROVIDER=fake     → logs code to console, no real delivery.
     */
    if (!isTestNumber) await this.otp.send(phone, code);

    return { sent: true, devHint: (isTestNumber && this.env.OTP_PROVIDER === "fake") ? this.env.DEV_OTP_CODE : undefined };
  }

  async verifyOtp(phone: string, code: string): Promise<IssuedTokens> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) {
      throw new UnauthorizedException("OTP expired or not found. Request a new one.");
    }
    if (challenge.attempts >= 5) {
      throw new UnauthorizedException("Too many incorrect attempts. Request a new OTP.");
    }
    if (challenge.codeHash !== sha256(code)) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Incorrect OTP.");
    }
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumed: true },
    });

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new NotFoundException(
        "This number is not registered. Ask your booth leader to add you.",
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return this.issueTokens(user.id, user.role as Role);
  }

  async issueTokens(userId: string, role: Role): Promise<IssuedTokens> {
    const accessToken = await this.signAccess(userId, role);
    const refreshToken = await this.signRefresh(userId, newId());
    return { accessToken, refreshToken, userId };
  }

  private async signAccess(userId: string, role: Role): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, role, typ: "access" },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL },
    );
  }

  private async signRefresh(userId: string, familyId: string): Promise<string> {
    const token = await this.jwt.signAsync(
      { sub: userId, familyId, jti: newId(), typ: "refresh" },
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.JWT_REFRESH_TTL },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000),
      },
    });
    return token;
  }

  /** Rotate a refresh token. Detects reuse and revokes the whole family. */
  async refresh(token: string | undefined): Promise<IssuedTokens> {
    if (!token) throw new UnauthorizedException("No refresh token provided.");

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.revoked || record.expiresAt < new Date()) {
      // Token replay or expiry: revoke the family as a precaution.
      if (payload.familyId) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: payload.familyId },
          data: { revoked: true },
        });
      }
      throw new UnauthorizedException("Session expired. Please log in again.");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) throw new UnauthorizedException();

    const accessToken = await this.signAccess(user.id, user.role as Role);
    const refreshToken = await this.signRefresh(user.id, record.familyId);
    return { accessToken, refreshToken, userId: user.id };
  }

  async logout(token: string | undefined): Promise<{ ok: true }> {
    if (token) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(token) },
        data: { revoked: true },
      });
    }
    return { ok: true };
  }
}
