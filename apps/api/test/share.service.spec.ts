import { describe, expect, it, vi } from "vitest";
import { SCORING } from "@pw/shared";
import { ShareService } from "../src/share/share.service";

/**
 * ShareService(prisma, scoring, assisted, storage, env).
 * Core-loop contract: prepare (POST /share) awards NOTHING; confirm
 * (POST /share/confirm) records the real channel and credits the base
 * point exactly once per (worker, creative).
 */

const env = { PUBLIC_LINK_BASE: "https://links.example" } as any;

function makeStorage() {
  return { put: vi.fn(), publicUrl: vi.fn((k: string) => `https://cdn/${k}`), signedUrl: vi.fn() };
}
function makeScoring() {
  return { award: vi.fn().mockResolvedValue({}) };
}
function makeAssisted() {
  return { buildDeepLinks: vi.fn().mockReturnValue({ whatsapp: "wa://x" }) };
}

const creative = { id: "c1", sourceKey: "creatives/c1.png", captionVariants: { te: "తెలుగు", en: "English" } };
const user = { id: "u1", preferredLanguage: "te" };

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    creative: { findUniqueOrThrow: vi.fn().mockResolvedValue(creative) },
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue(user) },
    personalizedRender: { findFirst: vi.fn().mockResolvedValue(null) },
    shareEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "se1", trackedLinkId: "tl1", basePointsAwarded: 0, ...data }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe("ShareService.share (prepare)", () => {
  it("creates the share event with ZERO points and returns the tracked link", async () => {
    const prisma = makePrisma();
    const scoring = makeScoring();
    const svc = new ShareService(prisma as any, scoring as any, makeAssisted() as any, makeStorage() as any, env);

    const res = await svc.share("u1", "c1");

    expect(prisma.shareEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ basePointsAwarded: 0 }) }),
    );
    expect(scoring.award).not.toHaveBeenCalled();
    expect(res.basePointsAwarded).toBe(0);
    expect(res.trackedLink).toContain("https://links.example/r/");
    expect(res.caption).toContain("తెలుగు");
  });

  it("returns the worker's personalized render when one exists", async () => {
    const prisma = makePrisma({
      personalizedRender: { findFirst: vi.fn().mockResolvedValue({ cachedUrl: "https://cdn/renders/u1/c1.png" }) },
    });
    const svc = new ShareService(prisma as any, makeScoring() as any, makeAssisted() as any, makeStorage() as any, env);

    const res = await svc.share("u1", "c1");
    expect(res.personalizedUrl).toBe("https://cdn/renders/u1/c1.png");
    expect(res.mediaUrl).toBe("https://cdn/creatives/c1.png");
  });

  it("reuses the existing share event (no duplicate tracked links)", async () => {
    const existing = { id: "se1", trackedLinkId: "tl1", basePointsAwarded: SCORING.SHARE_BASE };
    const prisma = makePrisma({
      shareEvent: { ...makePrisma().shareEvent, findFirst: vi.fn().mockResolvedValue(existing) },
    });
    const svc = new ShareService(prisma as any, makeScoring() as any, makeAssisted() as any, makeStorage() as any, env);

    const res = await svc.share("u1", "c1");
    expect(prisma.shareEvent.create).not.toHaveBeenCalled();
    expect(res.shareEventId).toBe("se1");
    expect(res.basePointsAwarded).toBe(SCORING.SHARE_BASE);
  });
});

describe("ShareService.confirm", () => {
  it("awards the base point once and records the real channel", async () => {
    const prisma = makePrisma();
    prisma.shareEvent.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: 0 });
    const scoring = makeScoring();
    const svc = new ShareService(prisma as any, scoring as any, makeAssisted() as any, makeStorage() as any, env);

    const res = await svc.confirm("u1", "se1", "whatsapp");

    expect(res.pointsAwarded).toBe(SCORING.SHARE_BASE);
    expect(prisma.shareEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "whatsapp", basePointsAwarded: SCORING.SHARE_BASE }),
      }),
    );
    expect(scoring.award).toHaveBeenCalledWith("u1", "share", SCORING.SHARE_BASE, {
      shareEventId: "se1",
      channel: "whatsapp",
    });
  });

  it("is idempotent — a repeat share updates the channel but awards 0", async () => {
    const prisma = makePrisma();
    prisma.shareEvent.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ id: "se1", userId: "u1", basePointsAwarded: SCORING.SHARE_BASE });
    const scoring = makeScoring();
    const svc = new ShareService(prisma as any, scoring as any, makeAssisted() as any, makeStorage() as any, env);

    const res = await svc.confirm("u1", "se1", "instagram_story");

    expect(res.pointsAwarded).toBe(0);
    expect(scoring.award).not.toHaveBeenCalled();
    expect(prisma.shareEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "instagram_story" }) }),
    );
  });

  it("rejects confirming someone else's share", async () => {
    const prisma = makePrisma();
    prisma.shareEvent.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ id: "se1", userId: "OTHER", basePointsAwarded: 0 });
    const svc = new ShareService(prisma as any, makeScoring() as any, makeAssisted() as any, makeStorage() as any, env);

    await expect(svc.confirm("u1", "se1", "whatsapp")).rejects.toThrow();
  });
});
