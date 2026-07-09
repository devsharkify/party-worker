import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FieldService } from "../src/field/field.service";

/**
 * Field-duty contract: location writes are DPDP consent-gated; the team view
 * is leader/HQ-only and subtree-scoped. This is the deliberate fix for
 * voter_connect's unauthenticated location WebSocket.
 */

const hq = { id: "hq1", role: "hq_admin" } as any;
const leader = { id: "l1", role: "constituency_leader" } as any;
const worker = { id: "w1", role: "worker" } as any;

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    consentRecord: {
      findUnique: vi.fn().mockResolvedValue({ granted: true }),
    },
    fieldLocation: {
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "l1", orgUnitId: "const-1" }),
    },
    ...overrides,
  };
}

function makeOrg() {
  return { getDescendantIds: vi.fn().mockResolvedValue(["const-1", "booth-1"]) };
}

describe("FieldService", () => {
  it("rejects location update without granted consent", async () => {
    const prisma = makePrisma();
    prisma.consentRecord.findUnique.mockResolvedValue(null);
    const svc = new FieldService(prisma as any, makeOrg() as any);
    await expect(
      svc.updateLocation(worker, { latitude: 17.4, longitude: 78.5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.fieldLocation.upsert).not.toHaveBeenCalled();
  });

  it("accepts a consented ping and upserts the single row", async () => {
    const prisma = makePrisma();
    const svc = new FieldService(prisma as any, makeOrg() as any);
    const out = await svc.updateLocation(worker, { latitude: 17.4, longitude: 78.5, accuracy: 12 });
    expect(out).toEqual({ ok: true, onDuty: true });
    expect(prisma.fieldLocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "w1" } }),
    );
  });

  it("rejects out-of-range coordinates", async () => {
    const svc = new FieldService(makePrisma() as any, makeOrg() as any);
    await expect(
      svc.updateLocation(worker, { latitude: 91, longitude: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("team view is denied to plain workers", async () => {
    const svc = new FieldService(makePrisma() as any, makeOrg() as any);
    await expect(svc.team(worker)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("leader team view filters to their subtree; HQ is unfiltered", async () => {
    const prisma = makePrisma();
    const org = makeOrg();
    const svc = new FieldService(prisma as any, org as any);
    await svc.team(leader);
    expect(org.getDescendantIds).toHaveBeenCalledWith("const-1");
    expect(prisma.fieldLocation.findMany.mock.calls[0][0].where).toEqual({
      user: { orgUnitId: { in: ["const-1", "booth-1"] } },
    });
    await svc.team(hq);
    expect(prisma.fieldLocation.findMany.mock.calls[1][0].where).toEqual({});
  });
});
