import { describe, expect, it, vi } from "vitest";
import { computeSharePoints } from "@pw/shared";
import { SocialService } from "../src/social/social.service";

/**
 * SocialService(prisma, scoring, ig).
 * We mock prisma.socialAccount/shareEvent/reachEvent, the ScoringService.award,
 * and the InstagramProvider.getInsights. syncInstagram should award the capped,
 * reach-weighted delta from REAL insight numbers for connected creator accounts.
 */

function makeScoring() {
  return { award: vi.fn().mockResolvedValue({}) };
}

describe("SocialService.syncInstagram — gating", () => {
  it("returns {synced:false} when there is no Instagram account", async () => {
    const prisma = { socialAccount: { findFirst: vi.fn().mockResolvedValue(null) } };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, { getInsights: vi.fn() } as any);

    const res = await svc.syncInstagram("u1");

    expect(res.synced).toBe(false);
    expect(res.awarded).toBe(0);
    expect(res.posts).toBe(0);
    expect(scoring.award).not.toHaveBeenCalled();
  });

  it("returns {synced:false} for a PERSONAL account (base points only)", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({ connected: true, type: "personal" }),
      },
    };
    const ig = { getInsights: vi.fn() };
    const svc = new SocialService(prisma as any, makeScoring() as any, ig as any);

    const res = await svc.syncInstagram("u1");

    expect(res.synced).toBe(false);
    expect(res.reason).toMatch(/Creator account/i);
    expect(ig.getInsights).not.toHaveBeenCalled();
  });

  it("returns {synced:false} for an unconnected creator account", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({ connected: false, type: "creator" }),
      },
    };
    const svc = new SocialService(prisma as any, makeScoring() as any, { getInsights: vi.fn() } as any);
    expect((await svc.syncInstagram("u1")).synced).toBe(false);
  });
});

describe("SocialService.syncInstagram — connected creator awards", () => {
  it("awards round(computeSharePoints(reach)) - prevAwarded per post and records it", async () => {
    const shares = [{ id: "s1" }];
    const reachEventRow = { id: "re1", uniqueCount: 100 };
    const prisma = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ connected: true, type: "creator", accessTokenEnc: "tok" }),
      },
      shareEvent: { findMany: vi.fn().mockResolvedValue(shares) },
      reachEvent: {
        findUnique: vi.fn().mockResolvedValue(null), // nothing awarded before
        upsert: vi.fn().mockResolvedValue(reachEventRow),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ig = {
      getInsights: vi
        .fn()
        .mockResolvedValue({ reach: 100, views: 400, likes: 12, comments: 2 }),
    };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, ig as any);

    const res = await svc.syncInstagram("u1");

    const target = Math.round(computeSharePoints(100)); // 12
    expect(res.synced).toBe(true);
    expect(res.posts).toBe(1);
    expect(res.awarded).toBe(target);
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", target, {
      instagram: true,
      shareEventId: "s1",
    });
    // awardedPoints persisted on the reach event
    expect(prisma.reachEvent.update).toHaveBeenCalledWith({
      where: { id: "re1" },
      data: { awardedPoints: target },
    });
    // passes the (possibly absent) access token to the provider
    expect(ig.getInsights).toHaveBeenCalledWith({ mediaId: "ig_s1", accessToken: "tok" });
  });

  it("awards only the DELTA over previously-awarded points", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ connected: true, type: "creator", accessTokenEnc: "tok" }),
      },
      shareEvent: { findMany: vi.fn().mockResolvedValue([{ id: "s1" }]) },
      reachEvent: {
        findUnique: vi.fn().mockResolvedValue({ awardedPoints: 5 }),
        upsert: vi.fn().mockResolvedValue({ id: "re1", uniqueCount: 100 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ig = {
      getInsights: vi.fn().mockResolvedValue({ reach: 100, views: 1, likes: 1, comments: 0 }),
    };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, ig as any);

    const res = await svc.syncInstagram("u1");

    const target = Math.round(computeSharePoints(100)); // 12
    expect(res.awarded).toBe(target - 5); // 7
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", target - 5, expect.any(Object));
  });

  it("caps the award at SHARE_CAP via computeSharePoints for huge reach", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ connected: true, type: "creator", accessTokenEnc: "tok" }),
      },
      shareEvent: { findMany: vi.fn().mockResolvedValue([{ id: "s1" }]) },
      reachEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "re1", uniqueCount: 999_999 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ig = {
      getInsights: vi
        .fn()
        .mockResolvedValue({ reach: 999_999, views: 1, likes: 1, comments: 1 }),
    };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, ig as any);

    const res = await svc.syncInstagram("u1");

    expect(res.awarded).toBe(30); // SHARE_CAP
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", 30, expect.any(Object));
  });

  it("does NOT award when the delta is <= 0 (already fully awarded)", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ connected: true, type: "creator", accessTokenEnc: "tok" }),
      },
      shareEvent: { findMany: vi.fn().mockResolvedValue([{ id: "s1" }]) },
      reachEvent: {
        findUnique: vi.fn().mockResolvedValue({ awardedPoints: 12 }),
        upsert: vi.fn().mockResolvedValue({ id: "re1", uniqueCount: 100 }), // target 12
        update: vi.fn(),
      },
    };
    const ig = {
      getInsights: vi.fn().mockResolvedValue({ reach: 100, views: 1, likes: 1, comments: 0 }),
    };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, ig as any);

    const res = await svc.syncInstagram("u1");

    expect(res.awarded).toBe(0);
    expect(scoring.award).not.toHaveBeenCalled();
    expect(prisma.reachEvent.update).not.toHaveBeenCalled();
  });

  it("sums the per-post deltas across multiple shares", async () => {
    const prisma = {
      socialAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ connected: true, type: "creator", accessTokenEnc: "tok" }),
      },
      shareEvent: { findMany: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]) },
      reachEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        // s1 reach 100 -> 12; s2 reach 25 -> round(4.5)=5
        upsert: vi
          .fn()
          .mockResolvedValueOnce({ id: "re1", uniqueCount: 100 })
          .mockResolvedValueOnce({ id: "re2", uniqueCount: 25 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ig = {
      getInsights: vi
        .fn()
        .mockResolvedValueOnce({ reach: 100, views: 1, likes: 1, comments: 0 })
        .mockResolvedValueOnce({ reach: 25, views: 1, likes: 1, comments: 0 }),
    };
    const scoring = makeScoring();
    const svc = new SocialService(prisma as any, scoring as any, ig as any);

    const res = await svc.syncInstagram("u1");

    expect(res.posts).toBe(2);
    expect(res.awarded).toBe(12 + 5);
    expect(scoring.award).toHaveBeenCalledTimes(2);
  });
});

describe("SocialService.list / connect mapping", () => {
  it("marks insightsAvailable only for connected non-personal accounts", async () => {
    const prisma = {
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([
          { platform: "instagram", type: "creator", connected: true, handle: "@a" },
          { platform: "instagram", type: "personal", connected: true, handle: "@b" },
          { platform: "instagram", type: "creator", connected: false, handle: null },
        ]),
      },
    };
    const svc = new SocialService(prisma as any, makeScoring() as any, { getInsights: vi.fn() } as any);

    const out = await svc.list("u1");
    expect(out[0].insightsAvailable).toBe(true);
    expect(out[1].insightsAvailable).toBe(false); // personal
    expect(out[2].insightsAvailable).toBe(false); // unconnected
  });

  it("connectInstagram with type='personal' yields an unconnected, handle-less account", async () => {
    const prisma = {
      socialAccount: {
        upsert: vi.fn().mockResolvedValue({ type: "personal", connected: false, handle: null }),
      },
    };
    const svc = new SocialService(prisma as any, makeScoring() as any, { getInsights: vi.fn() } as any);

    const out = await svc.connectInstagram("u1", "personal");
    expect(out.connected).toBe(false);
    expect(out.insightsAvailable).toBe(false);
    // upsert payload reflects the disconnected state
    const payload = prisma.socialAccount.upsert.mock.calls[0][0];
    expect(payload.create.connected).toBe(false);
    expect(payload.create.handle).toBeNull();
  });
});
