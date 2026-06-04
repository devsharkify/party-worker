import { describe, expect, it, vi } from "vitest";
import { computeSharePoints } from "@pw/shared";
import { ReachService } from "../src/share/reach.service";

/**
 * ReachService(prisma, scoring, storage, env).
 * Private helpers (truncateIp, awardReachDelta) are exercised through the public
 * isCrawler / recordTap surface. We cast `as any` to reach privates only for the
 * IP-truncation unit checks.
 */

function makeStorage() {
  return { put: vi.fn(), publicUrl: vi.fn((k: string) => `https://cdn/${k}`), signedUrl: vi.fn() };
}
const env = { WEB_APP_URL: "http://localhost:8081" } as any;

function makeScoring() {
  return { award: vi.fn().mockResolvedValue({}) };
}

describe("ReachService.isCrawler", () => {
  const svc = new ReachService({} as any, makeScoring() as any, makeStorage() as any, env);

  it("flags WhatsApp link previews", () => {
    expect(svc.isCrawler("WhatsApp/2.23")).toBe(true);
  });
  it("flags facebookexternalhit", () => {
    expect(svc.isCrawler("facebookexternalhit/1.1")).toBe(true);
  });
  it("flags generic bots/crawlers/spiders/preview agents", () => {
    expect(svc.isCrawler("Googlebot/2.1")).toBe(true);
    expect(svc.isCrawler("some-crawler")).toBe(true);
    expect(svc.isCrawler("a spider here")).toBe(true);
    expect(svc.isCrawler("link-preview-fetcher")).toBe(true);
    expect(svc.isCrawler("TelegramBot (like TwitterBot)")).toBe(true);
  });
  it("does NOT flag a normal mobile browser UA", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(svc.isCrawler(ua)).toBe(false);
  });
  it("treats empty/undefined UA as not-a-crawler", () => {
    expect(svc.isCrawler("")).toBe(false);
    expect(svc.isCrawler(undefined as any)).toBe(false);
  });
});

describe("ReachService.truncateIp (private, via cast) — DPDP minimization", () => {
  const svc = new ReachService({} as any, makeScoring() as any, makeStorage() as any, env) as any;

  it("zeroes the last IPv4 octet (/24)", () => {
    expect(svc.truncateIp("203.0.113.45")).toBe("203.0.113.0");
  });
  it("keeps only the first 3 IPv6 groups (/48)", () => {
    expect(svc.truncateIp("2001:db8:abcd:1234:5678:9abc:def0:1234")).toBe("2001:db8:abcd::");
  });
  it("maps empty IP to a stable placeholder", () => {
    expect(svc.truncateIp("")).toBe("0");
  });
});

describe("ReachService.recordTap — dedup + incremental award", () => {
  const ua = "Mozilla/5.0 browser";

  it("returns {counted:false} and awards nothing when the link is unknown", async () => {
    const prisma = {
      shareEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      reachHit: { create: vi.fn() },
      reachEvent: { upsert: vi.fn() },
    };
    const scoring = makeScoring();
    const svc = new ReachService(prisma as any, scoring as any, makeStorage() as any, env);

    const res = await svc.recordTap("nope", "1.2.3.4", ua);

    expect(res).toEqual({ counted: false });
    expect(prisma.reachHit.create).not.toHaveBeenCalled();
    expect(scoring.award).not.toHaveBeenCalled();
  });

  it("first unique tap: counts, upserts reach=1, awards round(computeSharePoints(1)) minus 0", async () => {
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      reachHit: { create: vi.fn().mockResolvedValue({}) },
      reachEvent: { upsert: vi.fn().mockResolvedValue({ uniqueCount: 1 }) },
    };
    const scoring = makeScoring();
    const svc = new ReachService(prisma as any, scoring as any, makeStorage() as any, env);

    const res = await svc.recordTap("link1", "203.0.113.7", ua);

    expect(res).toEqual({ counted: true });
    const target = Math.round(computeSharePoints(1)); // 2
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", target, {
      shareEventId: "se1",
      reach: 1,
    });
    // basePointsAwarded bumped to the new target
    expect(prisma.shareEvent.update).toHaveBeenCalledWith({
      where: { id: "se1" },
      data: { basePointsAwarded: target },
    });
  });

  it("awards only the DELTA over what was already awarded", async () => {
    // reach climbs to 100 => target = round(computeSharePoints(100)) = 12; already 5 awarded => delta 7
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: 5 }),
        update: vi.fn().mockResolvedValue({}),
      },
      reachHit: { create: vi.fn().mockResolvedValue({}) },
      reachEvent: { upsert: vi.fn().mockResolvedValue({ uniqueCount: 100 }) },
    };
    const scoring = makeScoring();
    const svc = new ReachService(prisma as any, scoring as any, makeStorage() as any, env);

    await svc.recordTap("link1", "203.0.113.7", ua);

    const target = Math.round(computeSharePoints(100)); // 12
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", target - 5, expect.any(Object));
    expect(prisma.shareEvent.update).toHaveBeenCalledWith({
      where: { id: "se1" },
      data: { basePointsAwarded: target },
    });
  });

  it("does NOT award when the delta is <= 0 (reach below already-awarded target)", async () => {
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: 12 }),
        update: vi.fn().mockResolvedValue({}),
      },
      reachHit: { create: vi.fn().mockResolvedValue({}) },
      reachEvent: { upsert: vi.fn().mockResolvedValue({ uniqueCount: 1 }) }, // target 2 < 12
    };
    const scoring = makeScoring();
    const svc = new ReachService(prisma as any, scoring as any, makeStorage() as any, env);

    const res = await svc.recordTap("link1", "203.0.113.7", ua);

    expect(res).toEqual({ counted: true }); // hit still recorded
    expect(scoring.award).not.toHaveBeenCalled();
    expect(prisma.shareEvent.update).not.toHaveBeenCalled();
  });

  it("duplicate device: reachHit.create throws (unique violation) => {counted:false}, no award", async () => {
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: 0 }),
        update: vi.fn(),
      },
      reachHit: { create: vi.fn().mockRejectedValue(new Error("unique constraint")) },
      reachEvent: { upsert: vi.fn() },
    };
    const scoring = makeScoring();
    const svc = new ReachService(prisma as any, scoring as any, makeStorage() as any, env);

    const res = await svc.recordTap("link1", "203.0.113.7", ua);

    expect(res).toEqual({ counted: false });
    expect(prisma.reachEvent.upsert).not.toHaveBeenCalled();
    expect(scoring.award).not.toHaveBeenCalled();
  });
});

describe("ReachService.resolveDestination", () => {
  it("returns null when the tracked link is unknown", async () => {
    const prisma = { shareEvent: { findUnique: vi.fn().mockResolvedValue(null) } };
    const svc = new ReachService(prisma as any, makeScoring() as any, makeStorage() as any, env);
    expect(await svc.resolveDestination("x")).toBeNull();
  });

  it("prefers the personalized render's cachedUrl when present", async () => {
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "u1",
          creativeId: "c1",
          creative: { sourceKey: "creatives/c1.png" },
        }),
      },
      personalizedRender: {
        findUnique: vi.fn().mockResolvedValue({ cachedUrl: "https://cdn/render-u1.png" }),
      },
    };
    const svc = new ReachService(prisma as any, makeScoring() as any, makeStorage() as any, env);
    expect(await svc.resolveDestination("link1")).toBe("https://cdn/render-u1.png");
  });

  it("falls back to storage.publicUrl(sourceKey) when there is no render", async () => {
    const storage = makeStorage();
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "u1",
          creativeId: "c1",
          creative: { sourceKey: "creatives/c1.png" },
        }),
      },
      personalizedRender: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new ReachService(prisma as any, makeScoring() as any, storage as any, env);
    expect(await svc.resolveDestination("link1")).toBe("https://cdn/creatives/c1.png");
    expect(storage.publicUrl).toHaveBeenCalledWith("creatives/c1.png");
  });

  it("uses an absolute http(s) sourceKey verbatim (no storage rewrite)", async () => {
    const storage = makeStorage();
    const prisma = {
      shareEvent: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "u1",
          creativeId: "c1",
          creative: { sourceKey: "https://example.com/already.png" },
        }),
      },
      personalizedRender: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new ReachService(prisma as any, makeScoring() as any, storage as any, env);
    expect(await svc.resolveDestination("link1")).toBe("https://example.com/already.png");
    expect(storage.publicUrl).not.toHaveBeenCalled();
  });
});
