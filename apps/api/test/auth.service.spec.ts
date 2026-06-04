import { describe, expect, it, vi } from "vitest";
import { HttpException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service";
import { sha256 } from "../src/auth/crypto.util";

/**
 * AuthService(prisma, jwt, otp, env).
 * crypto.util.sha256 is the real (deterministic) hash so we can compute the
 * expected codeHash in tests. We mock prisma.otpChallenge / user, the OtpProvider,
 * and JwtService.signAsync.
 */

const baseEnv = {
  OTP_PROVIDER: "authkey", // not 'fake' so only the prefix bypass applies
  OTP_BYPASS_PREFIX: "+91900000",
  DEV_OTP_CODE: "000000",
  JWT_ACCESS_SECRET: "acc",
  JWT_REFRESH_SECRET: "ref",
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 5184000,
} as any;

function makeJwt() {
  return {
    signAsync: vi.fn(async (_p: any, opts: any) => `tok-${opts.expiresIn}`),
    verifyAsync: vi.fn(),
  };
}
function makeOtp() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("AuthService.requestOtp", () => {
  it("test-number (matches OTP_BYPASS_PREFIX): sets devHint and does NOT send SMS", async () => {
    const prisma = {
      otpChallenge: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    };
    const otp = makeOtp();
    const svc = new AuthService(prisma as any, makeJwt() as any, otp as any, baseEnv);

    const res = await svc.requestOtp("+919000001234");

    expect(res).toEqual({ sent: true, devHint: "000000" });
    expect(otp.send).not.toHaveBeenCalled();
    // challenge stored with the DEV code hash
    const createArg = prisma.otpChallenge.create.mock.calls[0][0];
    expect(createArg.data.codeHash).toBe(sha256("000000"));
    expect(createArg.data.phone).toBe("+919000001234");
  });

  it("real number: sends SMS via the provider and returns NO devHint", async () => {
    const prisma = {
      otpChallenge: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    };
    const otp = makeOtp();
    const svc = new AuthService(prisma as any, makeJwt() as any, otp as any, baseEnv);

    const res = await svc.requestOtp("+919876543210");

    expect(res.sent).toBe(true);
    expect(res.devHint).toBeUndefined();
    expect(otp.send).toHaveBeenCalledTimes(1);
    // the code sent is a generated 6-digit code, not the dev code
    const [phoneArg, codeArg] = otp.send.mock.calls[0];
    expect(phoneArg).toBe("+919876543210");
    expect(codeArg).toMatch(/^\d{6}$/);
    // and the stored hash matches that sent code
    const createArg = prisma.otpChallenge.create.mock.calls[0][0];
    expect(createArg.data.codeHash).toBe(sha256(codeArg));
  });

  it("OTP_PROVIDER='fake' treats ALL numbers as test numbers (devHint, no send)", async () => {
    const prisma = {
      otpChallenge: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    };
    const otp = makeOtp();
    const svc = new AuthService(prisma as any, makeJwt() as any, otp as any, {
      ...baseEnv,
      OTP_PROVIDER: "fake",
    });

    const res = await svc.requestOtp("+919876543210"); // a real-looking number
    expect(res.devHint).toBe("000000");
    expect(otp.send).not.toHaveBeenCalled();
  });

  it("rate-limits after 5 challenges within the hour (429)", async () => {
    const prisma = {
      otpChallenge: { count: vi.fn().mockResolvedValue(5), create: vi.fn() },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    await expect(svc.requestOtp("+919876543210")).rejects.toBeInstanceOf(HttpException);
    expect(prisma.otpChallenge.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.verifyOtp", () => {
  const phone = "+919876543210";

  it("throws Unauthorized when no live challenge is found (expired/missing)", async () => {
    const prisma = { otpChallenge: { findFirst: vi.fn().mockResolvedValue(null) } };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    await expect(svc.verifyOtp(phone, "123456")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws when attempts are already exhausted (>=5)", async () => {
    const prisma = {
      otpChallenge: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", codeHash: sha256("111111"), attempts: 5 }),
        update: vi.fn(),
      },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    await expect(svc.verifyOtp(phone, "111111")).rejects.toThrow(/Too many incorrect attempts/i);
    expect(prisma.otpChallenge.update).not.toHaveBeenCalled();
  });

  it("wrong code: increments attempts and throws Unauthorized", async () => {
    const prisma = {
      otpChallenge: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", codeHash: sha256("111111"), attempts: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    await expect(svc.verifyOtp(phone, "999999")).rejects.toThrow(/Incorrect OTP/i);
    expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("correct code but unknown user: consumes challenge then throws NotFound", async () => {
    const prisma = {
      otpChallenge: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", codeHash: sha256("123456"), attempts: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    await expect(svc.verifyOtp(phone, "123456")).rejects.toBeInstanceOf(NotFoundException);
    // challenge was consumed before the user lookup
    expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { consumed: true },
    });
  });

  it("correct code + known user: consumes challenge, touches lastActiveAt, returns tokens", async () => {
    const prisma = {
      otpChallenge: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", codeHash: sha256("123456"), attempts: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "u1", role: "worker", phone }),
        update: vi.fn().mockResolvedValue({}),
      },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    };
    const jwt = makeJwt();
    const svc = new AuthService(prisma as any, jwt as any, makeOtp() as any, baseEnv);

    const tokens = await svc.verifyOtp(phone, "123456");

    expect(tokens.userId).toBe("u1");
    expect(tokens.accessToken).toBe("tok-900"); // signAsync used JWT_ACCESS_TTL
    expect(tokens.refreshToken).toBe("tok-5184000");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { lastActiveAt: expect.any(Date) },
    });
    // access token signed with role + access secret
    const accessSignArgs = jwt.signAsync.mock.calls[0];
    expect(accessSignArgs[0]).toMatchObject({ sub: "u1", role: "worker", typ: "access" });
    expect(accessSignArgs[1]).toMatchObject({ secret: "acc" });
    // a refresh token row is persisted
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });
});

describe("AuthService.issueTokens", () => {
  it("signs an access + refresh pair and persists the refresh row", async () => {
    const prisma = { refreshToken: { create: vi.fn().mockResolvedValue({}) } };
    const jwt = makeJwt();
    const svc = new AuthService(prisma as any, jwt as any, makeOtp() as any, baseEnv);

    const tokens = await svc.issueTokens("u9", "leader");

    expect(tokens).toMatchObject({ userId: "u9", accessToken: "tok-900", refreshToken: "tok-5184000" });
    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    const refreshRow = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(refreshRow.userId).toBe("u9");
    expect(refreshRow.tokenHash).toBe(sha256("tok-5184000"));
    expect(refreshRow.revoked).toBeUndefined();
  });
});

describe("AuthService.logout / refresh guards", () => {
  it("logout revokes all rows for the token hash and returns ok", async () => {
    const prisma = { refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);

    const res = await svc.logout("some-token");
    expect(res).toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256("some-token") },
      data: { revoked: true },
    });
  });

  it("logout with no token is a no-op that still returns ok", async () => {
    const prisma = { refreshToken: { updateMany: vi.fn() } };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeOtp() as any, baseEnv);
    expect(await svc.logout(undefined)).toEqual({ ok: true });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("refresh without a token throws Unauthorized", async () => {
    const svc = new AuthService({} as any, makeJwt() as any, makeOtp() as any, baseEnv);
    await expect(svc.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
