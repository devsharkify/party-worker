import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { VotersService } from "../src/voters/voters.service";
import { parseVoterCsv, tokenizeCsv } from "../src/voters/voter-csv.util";

/**
 * Scoping contract: HQ/state see the whole tree; everyone else needs the
 * backend-toggled voterAccessEnabled flag and is confined to their subtree.
 * Every read/write leaves a VoterAccessLog row.
 */

const hq = { id: "hq1", role: "hq_admin" } as any;
const leader = { id: "l1", role: "constituency_leader" } as any;
const worker = { id: "w1", role: "worker" } as any;

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "l1",
        orgUnitId: "const-1",
        voterAccessEnabled: true,
      }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    voter: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    voterSurvey: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "s1", ...data })),
    },
    voterImport: { create: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    voterAccessLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    orgUnit: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "booth-1", type: "booth" }),
      findFirst: vi.fn().mockResolvedValue({ id: "root" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    ...overrides,
  };
}

function makeOrg(subtree: string[] = ["const-1", "ward-1", "booth-1"]) {
  return {
    getDescendantIds: vi.fn().mockResolvedValue(subtree),
    getTree: vi.fn().mockResolvedValue([]),
  };
}

function makeScoring() {
  return { award: vi.fn().mockResolvedValue({}) };
}

function make(prisma = makePrisma(), org = makeOrg(), scoring = makeScoring()) {
  return {
    svc: new VotersService(prisma as any, org as any, scoring as any),
    prisma,
    org,
    scoring,
  };
}

describe("VotersService scope", () => {
  it("denies everything when voterAccessEnabled=false (non-admin)", async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "w1",
      orgUnitId: "booth-1",
      voterAccessEnabled: false,
    });
    const { svc } = make(prisma);
    await expect(svc.list(worker, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("HQ admin bypasses the flag and sees the whole tree (no boothId filter)", async () => {
    const { svc, prisma } = make();
    await svc.list(hq, {});
    const where = prisma.voter.findMany.mock.calls[0][0].where;
    expect(where.boothId).toBeUndefined();
  });

  it("leader with access is confined to their subtree", async () => {
    const { svc, prisma, org } = make();
    await svc.list(leader, {});
    expect(org.getDescendantIds).toHaveBeenCalledWith("const-1");
    const where = prisma.voter.findMany.mock.calls[0][0].where;
    expect(where.boothId.in).toEqual(["const-1", "ward-1", "booth-1"]);
  });

  it("rejects a requested unit outside the leader's subtree", async () => {
    const { svc } = make();
    await expect(svc.list(leader, { orgUnitId: "other-const" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("voter detail outside scope is denied even with a valid id", async () => {
    const prisma = makePrisma();
    prisma.voter.findUnique.mockResolvedValue({ id: "v9", boothId: "enemy-booth", houseNo: "1" });
    const { svc } = make(prisma);
    await expect(svc.detail(leader, "v9")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("bulk update silently clips to scope via boothId filter", async () => {
    const { svc, prisma } = make();
    await svc.bulkUpdate(leader, { ids: ["a", "b"], votingStatus: "green" });
    const where = prisma.voter.updateMany.mock.calls[0][0].where;
    expect(where.boothId.in).toContain("booth-1");
  });

  it("audit-logs list access", async () => {
    const { svc, prisma } = make();
    await svc.list(hq, {});
    await new Promise((r) => setTimeout(r, 0)); // fire-and-forget flush
    expect(prisma.voterAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "list" }) }),
    );
  });

  it("grant outside subtree is denied; inside is allowed and logged", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "t1",
      orgUnitId: "enemy",
      name: "X",
      phone: "1",
    });
    const { svc } = make(prisma);
    await expect(svc.setGrant(leader, "t1", true)).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findUnique.mockResolvedValue({
      id: "t2",
      orgUnitId: "ward-1",
      name: "Y",
      phone: "2",
    });
    prisma.user.update.mockResolvedValue({ id: "t2", voterAccessEnabled: true });
    const out = await svc.setGrant(leader, "t2", true);
    expect(out.voterAccessEnabled).toBe(true);
  });

  it("workers cannot grant access", async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "w1",
      orgUnitId: "booth-1",
      voterAccessEnabled: true,
    });
    const { svc } = make(prisma);
    await expect(svc.setGrant(worker, "t1", true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("access logs are HQ-only", async () => {
    const { svc } = make();
    await expect(svc.accessLogs(leader, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.accessLogs(hq, {})).resolves.toMatchObject({ total: 0 });
  });
});

describe("VotersService surveys", () => {
  it("creates a survey pinned to the worker's own unit and awards points", async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "w1", orgUnitId: "booth-1" });
    const { svc, scoring } = make(prisma);
    const survey = await svc.createSurvey(worker, {
      householdName: "Ramulu family",
      familyMembersCount: 4,
    });
    expect(survey.boothId).toBe("booth-1");
    expect(scoring.award).toHaveBeenCalledWith("w1", "voter_survey", 10, { surveyId: "s1" });
  });

  it("ignores a claimed boothId outside the worker's subtree", async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "w1", orgUnitId: "booth-1" });
    const { svc } = make(prisma, makeOrg(["booth-1"]));
    const survey = await svc.createSurvey(worker, {
      householdName: "H",
      boothId: "enemy-booth",
    });
    expect(survey.boothId).toBe("booth-1");
  });
});

describe("voter CSV parser", () => {
  it("tokenizes quoted fields with embedded commas", () => {
    const rows = tokenizeCsv('name,address\n"Rao, K","H.No 1-2, Street"\n');
    expect(rows[1]).toEqual(["Rao, K", "H.No 1-2, Street"]);
  });

  it("maps flexible header aliases and normalizes gender/numbers", () => {
    const csv = "sl_no,voter name,epic_no,sex,AGE,house no,part_no\n1,Anil Kumar,ABC1234567,male,34,1-2-3,12";
    const { rows, errors } = parseVoterCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      serialNo: 1,
      nameEn: "Anil Kumar",
      epicNo: "ABC1234567",
      gender: "M",
      age: 34,
      houseNo: "1-2-3",
      partNo: 12,
    });
  });

  it("rejects rows without a name and implausible ages, keeps the rest", () => {
    const csv = "name,age\nGood Voter,40\n,30\nToo Old,140";
    const { rows, errors } = parseVoterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].row).toBe(3);
  });

  it("fails fast when no name column exists", () => {
    const { rows, errors } = parseVoterCsv("epic,age\nX,30");
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toContain("name column");
  });
});

describe("VotersService change history", () => {
  it("records a diff row on status change and none on no-op", async () => {
    const prisma = makePrisma();
    prisma.voter.findUnique.mockResolvedValue({
      id: "v1", boothId: "booth-1", votingStatus: "unmarked", mobile: null, notes: null, isVoted: false,
    });
    prisma.voterChange = { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) } as any;
    const { svc } = make(prisma);
    await svc.update(hq, "v1", { votingStatus: "green" });
    await new Promise((r) => setTimeout(r, 0));
    expect((prisma as any).voterChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voterId: "v1",
          changes: [{ field: "votingStatus", from: "unmarked", to: "green" }],
        }),
      }),
    );
    (prisma as any).voterChange.create.mockClear();
    await svc.update(hq, "v1", { votingStatus: "unmarked" });
    await new Promise((r) => setTimeout(r, 0));
    expect((prisma as any).voterChange.create).not.toHaveBeenCalled();
  });

  it("history respects subtree scope", async () => {
    const prisma = makePrisma();
    prisma.voter.findUnique.mockResolvedValue({ id: "v9", boothId: "enemy-booth" });
    (prisma as any).voterChange = { findMany: vi.fn().mockResolvedValue([]) };
    const { svc } = make(prisma);
    await expect(svc.history(leader, "v9")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("voted filter narrows the list query", async () => {
    const { svc, prisma } = make();
    await svc.list(hq, { voted: "false" });
    expect(prisma.voter.findMany.mock.calls[0][0].where.isVoted).toBe(false);
  });
});
