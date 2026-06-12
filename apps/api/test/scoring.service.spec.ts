import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScoringService } from "../src/scoring/scoring.service";

/**
 * ScoringService is constructed as `new ScoringService(prisma, org)`.
 * We hand-build prisma + org as plain objects with vi.fn()s for only the
 * methods the service actually calls, then assert behavior.
 */

interface FakeUser {
  id: string;
  name?: string;
  photoUrl?: string | null;
  lifetimeReputation: number;
  weeklyLeaguePoints: number;
  tier?: string;
  streakDays?: number;
  orgUnitId?: string;
}

function makePrisma(user: FakeUser) {
  // $transaction just resolves the passed array (the ops are already vi.fn promises).
  return {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockReturnValue("user.update.op"),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    scoreEntry: {
      create: vi.fn().mockReturnValue("scoreEntry.create.op"),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeOrg() {
  return {
    getAncestorAtLevel: vi.fn(),
    getDescendantIds: vi.fn(),
    getAncestorChain: vi.fn(),
  };
}

describe("ScoringService.award — weekly + lifetime + tier recompute", () => {
  it("adds to BOTH weekly and lifetime for a normal reason (share)", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 100, weeklyLeaguePoints: 40 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "share", 10);

    expect(res.pointsAwarded).toBe(10);
    expect(res.lifetimeReputation).toBe(110);
    expect(res.weeklyLeaguePoints).toBe(50);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("writes the recomputed tier when crossing a threshold (499 + 1 => sevak)", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 499, weeklyLeaguePoints: 0 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "share", 1);

    expect(res.lifetimeReputation).toBe(500);
    expect(res.tier).toBe("sevak");
    // tier persisted via user.update
    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.tier).toBe("sevak");
    expect(updateArg.data.lifetimeReputation).toBe(500);
    expect(updateArg.data.weeklyLeaguePoints).toBe(1);
    expect(updateArg.data.lastActiveAt).toBeInstanceOf(Date);
  });

  it("persists a scoreEntry with matching weeklyDelta + lifetimeDelta", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 0, weeklyLeaguePoints: 0 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    await svc.award("u1", "share", 7, { shareEventId: "s1" });

    const entryArg = prisma.scoreEntry.create.mock.calls[0][0];
    expect(entryArg.data).toMatchObject({
      userId: "u1",
      reason: "share",
      points: 7,
      weeklyDelta: 7,
      lifetimeDelta: 7,
    });
    expect(entryArg.data.meta).toEqual({ shareEventId: "s1" });
  });

  it("decay: negative points reduce lifetime but leave weekly UNCHANGED", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 1000, weeklyLeaguePoints: 200 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "decay", -50);

    expect(res.lifetimeReputation).toBe(950); // lifetime decayed
    expect(res.weeklyLeaguePoints).toBe(200); // weekly untouched (weeklyDelta=0 for decay)
    const entryArg = prisma.scoreEntry.create.mock.calls[0][0];
    expect(entryArg.data.weeklyDelta).toBe(0);
    expect(entryArg.data.lifetimeDelta).toBe(-50);
  });

  it("clamps lifetime at 0 (cannot go negative)", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 30, weeklyLeaguePoints: 10 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "decay", -100);

    expect(res.lifetimeReputation).toBe(0);
    expect(res.tier).toBe("karyakarta");
  });

  it("clamps weekly at 0 for a negative non-decay reason", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 500, weeklyLeaguePoints: 5 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "share", -20);

    expect(res.weeklyLeaguePoints).toBe(0);
    expect(res.lifetimeReputation).toBe(480);
  });
});

describe("ScoringService.award — streak maintenance (IST days)", () => {
  const DAY = 24 * 3600_000;

  it("first activity ever: streakDays=1, no bonus entry", async () => {
    const prisma = makePrisma({ id: "u1", lifetimeReputation: 0, weeklyLeaguePoints: 0 });
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    await svc.award("u1", "share", 2);

    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.streakDays).toBe(1);
    expect(prisma.scoreEntry.create).toHaveBeenCalledTimes(1); // no streak bonus on day 1
  });

  it("active yesterday: streak increments and the +5 bonus entry is written", async () => {
    const prisma = makePrisma({
      id: "u1",
      lifetimeReputation: 100,
      weeklyLeaguePoints: 10,
      streakDays: 3,
      lastActiveAt: new Date(Date.now() - DAY),
    } as any);
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "share", 2);

    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.streakDays).toBe(4);
    // totals include the +5 streak bonus on top of the +2 share
    expect(res.lifetimeReputation).toBe(107);
    expect(res.weeklyLeaguePoints).toBe(17);
    expect(prisma.scoreEntry.create).toHaveBeenCalledTimes(2);
    const bonusArg = prisma.scoreEntry.create.mock.calls[1][0];
    expect(bonusArg.data).toMatchObject({ reason: "streak", points: 5, weeklyDelta: 5, lifetimeDelta: 5 });
  });

  it("second activity the same day: streak unchanged, no bonus", async () => {
    const prisma = makePrisma({
      id: "u1",
      lifetimeReputation: 100,
      weeklyLeaguePoints: 10,
      streakDays: 4,
      lastActiveAt: new Date(),
    } as any);
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    const res = await svc.award("u1", "share", 2);

    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.streakDays).toBe(4);
    expect(res.weeklyLeaguePoints).toBe(12); // just the share, no bonus
    expect(prisma.scoreEntry.create).toHaveBeenCalledTimes(1);
  });

  it("a 3-day gap resets the streak to 1 with no bonus", async () => {
    const prisma = makePrisma({
      id: "u1",
      lifetimeReputation: 100,
      weeklyLeaguePoints: 10,
      streakDays: 9,
      lastActiveAt: new Date(Date.now() - 3 * DAY),
    } as any);
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    await svc.award("u1", "share", 2);

    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.streakDays).toBe(1);
    expect(prisma.scoreEntry.create).toHaveBeenCalledTimes(1);
  });

  it("decay never touches the streak and never earns a bonus", async () => {
    const prisma = makePrisma({
      id: "u1",
      lifetimeReputation: 100,
      weeklyLeaguePoints: 10,
      streakDays: 6,
      lastActiveAt: new Date(Date.now() - DAY),
    } as any);
    const svc = new ScoringService(prisma as any, makeOrg() as any);

    await svc.award("u1", "decay", -10);

    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.streakDays).toBe(6);
    expect(prisma.scoreEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe("ScoringService.getLeaderboard — shaping", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let org: ReturnType<typeof makeOrg>;
  const viewer: FakeUser = {
    id: "viewer",
    name: "Viewer",
    lifetimeReputation: 1000,
    weeklyLeaguePoints: 120,
    tier: "sevak",
    orgUnitId: "booth-1",
  };

  beforeEach(() => {
    prisma = makePrisma(viewer);
    org = makeOrg();
  });

  it("returns an empty view when no ancestor at the requested level exists", async () => {
    org.getAncestorAtLevel.mockResolvedValue(null);
    const svc = new ScoringService(prisma as any, org as any);

    const view = await svc.getLeaderboard("viewer", "district");

    expect(view).toEqual({
      level: "district",
      orgUnitId: "",
      orgUnitName: "",
      viewerRank: null,
      entries: [],
    });
    // never queried users when there's no target
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("ranks entries, flags the viewer, and computes viewerRank from the higher-count", async () => {
    org.getAncestorAtLevel.mockResolvedValue({ id: "mandal-1", name: "Mandal One", type: "mandal" });
    org.getDescendantIds.mockResolvedValue(["mandal-1", "booth-1", "booth-2"]);
    prisma.user.findMany.mockResolvedValue([
      { id: "a", name: "Alpha", photoUrl: null, tier: "pramukh", weeklyLeaguePoints: 300 },
      { id: "viewer", name: "Viewer", photoUrl: null, tier: "sevak", weeklyLeaguePoints: 120 },
      { id: "c", name: "Cee", photoUrl: null, tier: "karyakarta", weeklyLeaguePoints: 50 },
    ]);
    prisma.user.count.mockResolvedValue(1); // one person above the viewer

    const svc = new ScoringService(prisma as any, org as any);
    const view = await svc.getLeaderboard("viewer", "mandal");

    expect(view.orgUnitId).toBe("mandal-1");
    expect(view.orgUnitName).toBe("Mandal One");
    expect(view.viewerRank).toBe(2); // higher(1) + 1
    expect(view.entries).toHaveLength(3);
    expect(view.entries[0]).toMatchObject({ rank: 1, userId: "a", points: 300, isViewer: false });
    expect(view.entries[1]).toMatchObject({ rank: 2, userId: "viewer", isViewer: true });
    // findMany scoped to the descendant ids
    expect(prisma.user.findMany.mock.calls[0][0].where.orgUnitId.in).toEqual([
      "mandal-1",
      "booth-1",
      "booth-2",
    ]);
  });
});

describe("ScoringService.getScoreSummary — shaping", () => {
  it("builds per-level ranks from the ancestor chain and tier progress", async () => {
    const user: FakeUser = {
      id: "u1",
      lifetimeReputation: 1800,
      weeklyLeaguePoints: 90,
      tier: "sevak",
      streakDays: 4,
      orgUnitId: "booth-1",
    };
    const prisma = makePrisma(user);
    const org = makeOrg();
    org.getAncestorChain.mockResolvedValue([
      { id: "booth-1", name: "Booth 1", type: "booth" },
      { id: "mandal-1", name: "Mandal 1", type: "mandal" },
    ]);
    org.getDescendantIds.mockImplementation(async (id: string) =>
      id === "booth-1" ? ["booth-1"] : ["mandal-1", "booth-1"],
    );
    // 0 above at booth level, 3 above at mandal level
    prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);

    const svc = new ScoringService(prisma as any, org as any);
    const summary = await svc.getScoreSummary("u1");

    expect(summary.lifetimeReputation).toBe(1800);
    expect(summary.weeklyLeaguePoints).toBe(90);
    expect(summary.tier).toBe("sevak");
    expect(summary.streakDays).toBe(4);
    // nextTierProgress(1800) => { next: 'pramukh', remaining: 200 }
    expect(summary.nextTier).toBe("pramukh");
    expect(summary.pointsToNextTier).toBe(200);
    expect(summary.ranks).toEqual({ booth: 1, mandal: 4 });
  });
});
