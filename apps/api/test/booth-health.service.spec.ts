import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { BoothHealthService } from "../src/booth-health/booth-health.service";

/**
 * Booth-health scoring contract: leader-scoped, sorted worst-first, and the
 * weakness score reflects the two things that win booths — someone is assigned
 * (panna) and the voters are being worked (marked).
 */

const hq = { id: "hq1", role: "hq_admin" } as any;
const leader = { id: "l1", role: "constituency_leader" } as any;
const worker = { id: "w1", role: "worker" } as any;

/**
 * Build a prisma mock where per-booth counts are driven by a fixture map:
 *   { [boothId]: { total, marked, green, voted, panna, workers, active, surveys } }
 */
function makePrisma(fixtures: Record<string, any>, booths: Array<{ id: string; name: string }>) {
  const f = (boothId: string) => fixtures[boothId] ?? {};
  const countRouter = (model: string) =>
    vi.fn().mockImplementation(({ where }: any) => {
      const b = f(where.boothId ?? where.orgUnitId);
      if (model === "voter") {
        if (where.votingStatus?.not === "unmarked") return Promise.resolve(b.marked ?? 0);
        if (where.votingStatus === "green") return Promise.resolve(b.green ?? 0);
        if (where.isVoted === true) return Promise.resolve(b.voted ?? 0);
        return Promise.resolve(b.total ?? 0);
      }
      if (model === "panna") return Promise.resolve(b.panna ?? 0);
      if (model === "user") {
        if (where.lastActiveAt) return Promise.resolve(b.active ?? 0);
        return Promise.resolve(b.workers ?? 0);
      }
      if (model === "survey") return Promise.resolve(b.surveys ?? 0);
      return Promise.resolve(0);
    });
  return {
    orgUnit: { findMany: vi.fn().mockResolvedValue(booths) },
    voter: { count: countRouter("voter") },
    pannaAssignment: { count: countRouter("panna") },
    user: {
      count: countRouter("user"),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "l1", orgUnitId: "const-1" }),
    },
    voterSurvey: { count: countRouter("survey") },
  };
}

function makeOrg(subtree: string[] = ["const-1", "b-strong", "b-weak"]) {
  return { getDescendantIds: vi.fn().mockResolvedValue(subtree) };
}

describe("BoothHealthService", () => {
  const booths = [
    { id: "b-strong", name: "Strong Booth" },
    { id: "b-weak", name: "Weak Booth" },
  ];
  const fixtures = {
    "b-strong": { total: 100, marked: 80, green: 60, voted: 0, panna: 90, workers: 4, active: 4, surveys: 30 },
    "b-weak": { total: 100, marked: 5, green: 1, voted: 0, panna: 5, workers: 1, active: 0, surveys: 0 },
  };

  it("sorts booths worst-first and flags the weak one", async () => {
    const svc = new BoothHealthService(makePrisma(fixtures, booths) as any, makeOrg() as any);
    const out = await svc.dashboard(leader);
    expect(out.booths[0].name).toBe("Weak Booth");
    expect(out.booths[0].weaknessScore).toBeGreaterThan(out.booths[1].weaknessScore);
    expect(out.booths[0].reasons).toContain("low_panna_coverage");
    expect(out.booths[0].reasons).toContain("low_canvassing");
    expect(out.booths[0].reasons).toContain("no_active_workers");
  });

  it("a well-run booth scores low with no weakness reasons", async () => {
    const svc = new BoothHealthService(makePrisma(fixtures, booths) as any, makeOrg() as any);
    const out = await svc.dashboard(leader);
    const strong = out.booths.find((b) => b.name === "Strong Booth")!;
    expect(strong.weaknessScore).toBeLessThan(20);
    expect(strong.pannaPct).toBe(90);
    expect(strong.supportPct).toBe(75); // 60 green / 80 marked
  });

  it("an empty booth (no roll) scores 100", async () => {
    const empty = [{ id: "b-empty", name: "Empty" }];
    const svc = new BoothHealthService(
      makePrisma({ "b-empty": { total: 0 } }, empty) as any,
      makeOrg(["const-1", "b-empty"]) as any,
    );
    const out = await svc.dashboard(leader);
    expect(out.booths[0].weaknessScore).toBe(100);
    expect(out.booths[0].reasons).toContain("no_voter_roll");
  });

  it("summary counts weak booths (score >= 60)", async () => {
    const svc = new BoothHealthService(makePrisma(fixtures, booths) as any, makeOrg() as any);
    const out = await svc.dashboard(leader);
    expect(out.summary.boothCount).toBe(2);
    expect(out.summary.weak).toBe(1);
    expect(out.summary.totalVoters).toBe(200);
  });

  it("workers cannot view booth health", async () => {
    const svc = new BoothHealthService(makePrisma(fixtures, booths) as any, makeOrg() as any);
    await expect(svc.dashboard(worker)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a unit outside the leader's subtree", async () => {
    const svc = new BoothHealthService(
      makePrisma(fixtures, booths) as any,
      makeOrg(["const-1", "b-strong"]) as any,
    );
    await expect(svc.dashboard(leader, "enemy-const")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("HQ sees all booths unfiltered", async () => {
    const prisma = makePrisma(fixtures, booths);
    const svc = new BoothHealthService(prisma as any, makeOrg() as any);
    await svc.dashboard(hq);
    // orgUnit.findMany called without an id filter (rootIds null)
    expect(prisma.orgUnit.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});
