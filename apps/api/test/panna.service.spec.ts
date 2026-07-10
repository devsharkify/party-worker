import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PannaService } from "../src/panna/panna.service";

/**
 * Panna spine contract: leaders assign booth voters (inside their subtree) to
 * workers in their subtree; one voter has one owner; a worker only sees & flags
 * their own panna.
 */

const hq = { id: "hq1", role: "hq_admin" } as any;
const leader = { id: "l1", role: "constituency_leader" } as any;
const worker = { id: "w1", role: "worker" } as any;

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "w1", orgUnitId: "booth-1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "l1", orgUnitId: "const-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    voter: {
      findMany: vi.fn().mockResolvedValue([{ id: "v1", boothId: "booth-1" }, { id: "v2", boothId: "booth-1" }]),
      count: vi.fn().mockResolvedValue(10),
    },
    pannaAssignment: {
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(4),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    ...overrides,
  };
}

function makeOrg(subtree: string[] = ["const-1", "booth-1"]) {
  return { getDescendantIds: vi.fn().mockResolvedValue(subtree) };
}

function make(prisma = makePrisma(), org = makeOrg()) {
  return { svc: new PannaService(prisma as any, org as any), prisma, org };
}

describe("PannaService.assign", () => {
  it("assigns in-scope voters to a worker in the leader's subtree", async () => {
    const { svc, prisma } = make();
    const out = await svc.assign(leader, { workerId: "w1", voterIds: ["v1", "v2"] });
    expect(out).toEqual({ assigned: 2 });
    expect(prisma.pannaAssignment.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects assigning to a worker outside the leader's subtree", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: "w9", orgUnitId: "enemy-booth" });
    const { svc } = make(prisma, makeOrg(["const-1", "booth-1"]));
    await expect(svc.assign(leader, { workerId: "w9", voterIds: ["v1"] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("workers cannot assign", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: "w2", orgUnitId: "booth-1" });
    const { svc } = make(prisma);
    await expect(svc.assign(worker, { workerId: "w2", voterIds: ["v1"] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects empty voter list", async () => {
    const { svc } = make();
    await expect(svc.assign(leader, { workerId: "w1", voterIds: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("clips out-of-scope voters (none assignable → 400)", async () => {
    const prisma = makePrisma();
    prisma.voter.findMany.mockResolvedValue([]); // scope filter removed them all
    const { svc } = make(prisma);
    await expect(svc.assign(leader, { workerId: "w1", voterIds: ["vX"] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("PannaService.myPanna", () => {
  it("returns the worker's own voters with a status summary", async () => {
    const prisma = makePrisma();
    prisma.pannaAssignment.findMany.mockResolvedValue([
      { knowsPersonally: true, voter: { id: "v1", votingStatus: "green", isVoted: true } },
      { knowsPersonally: false, voter: { id: "v2", votingStatus: "unmarked", isVoted: false } },
    ]);
    const { svc } = make(prisma);
    const out = await svc.myPanna(worker);
    expect(out.total).toBe(2);
    expect(out.summary.green).toBe(1);
    expect(out.summary.voted).toBe(1);
    expect(out.summary.known).toBe(1);
  });
});

describe("PannaService.setKnowsPersonally", () => {
  it("lets a worker flag a voter in their own panna", async () => {
    const prisma = makePrisma();
    prisma.pannaAssignment.findUnique.mockResolvedValue({ voterId: "v1", workerId: "w1" });
    const { svc } = make(prisma);
    const out = await svc.setKnowsPersonally(worker, "v1", true);
    expect(out).toEqual({ voterId: "v1", knowsPersonally: true });
  });

  it("rejects flagging a voter not in the worker's panna", async () => {
    const prisma = makePrisma();
    prisma.pannaAssignment.findUnique.mockResolvedValue({ voterId: "v1", workerId: "someone-else" });
    const { svc } = make(prisma);
    await expect(svc.setKnowsPersonally(worker, "v1", true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("PannaService.coverage", () => {
  it("computes coverage % and per-worker assigned counts", async () => {
    const prisma = makePrisma();
    prisma.voter.count.mockResolvedValue(100);
    prisma.pannaAssignment.count.mockResolvedValue(60);
    prisma.pannaAssignment.groupBy.mockResolvedValue([{ workerId: "w1", _count: { _all: 45 } }]);
    prisma.user.findMany.mockResolvedValue([
      { id: "w1", name: "Anil", phone: "1", orgUnit: { name: "Booth 1" } },
    ]);
    const { svc } = make(prisma);
    const out = await svc.coverage(leader);
    expect(out.coveragePct).toBe(60);
    expect(out.unassigned).toBe(40);
    expect(out.workers[0]).toMatchObject({ name: "Anil", assigned: 45 });
  });

  it("workers cannot view coverage", async () => {
    const { svc } = make();
    await expect(svc.coverage(worker)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
