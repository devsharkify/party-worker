import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { LEADER_ROLES, type Role } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Field-duty tracking — the honest rebuild of voter_connect's live map:
 * authenticated REST heartbeat instead of an open WebSocket, DPDP
 * consent-gated, one latest-position row per worker.
 */
@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  private isGlobal(role: Role): boolean {
    return role === "hq_admin" || role === "state_admin";
  }

  private async assertLocationConsent(userId: string): Promise<void> {
    const consent = await this.prisma.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose: "location" } },
    });
    if (!consent?.granted) {
      throw new ForbiddenException(
        "Location consent required — enable location sharing consent in the app first.",
      );
    }
  }

  async updateLocation(
    actor: AuthUser,
    dto: { latitude: number; longitude: number; accuracy?: number; onDuty?: boolean },
  ) {
    const lat = Number(dto.latitude);
    const lng = Number(dto.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException("latitude/longitude out of range.");
    }
    await this.assertLocationConsent(actor.id);
    const onDuty = dto.onDuty !== false;
    const accuracy = Number.isFinite(Number(dto.accuracy)) ? Number(dto.accuracy) : null;
    await this.prisma.fieldLocation.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, latitude: lat, longitude: lng, accuracy, onDuty },
      update: { latitude: lat, longitude: lng, accuracy, onDuty },
    });
    return { ok: true, onDuty };
  }

  async setDuty(actor: AuthUser, onDuty: boolean) {
    await this.prisma.fieldLocation.updateMany({
      where: { userId: actor.id },
      data: { onDuty },
    });
    return { ok: true, onDuty };
  }

  async me(actor: AuthUser) {
    const row = await this.prisma.fieldLocation.findUnique({ where: { userId: actor.id } });
    return { onDuty: row?.onDuty ?? false, updatedAt: row?.updatedAt ?? null };
  }

  /** Leaders see their subtree's field positions; HQ/state see everyone. */
  async team(actor: AuthUser) {
    if (!this.isGlobal(actor.role) && !LEADER_ROLES.includes(actor.role)) {
      throw new ForbiddenException("Only leaders can view the field team.");
    }
    let unitIds: string[] | null = null;
    if (!this.isGlobal(actor.role)) {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      unitIds = await this.org.getDescendantIds(me.orgUnitId);
    }
    const rows = await this.prisma.fieldLocation.findMany({
      where: unitIds ? { user: { orgUnitId: { in: unitIds } } } : {},
      orderBy: [{ onDuty: "desc" }, { updatedAt: "desc" }],
      take: 500,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            phone: true,
            orgUnit: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      role: r.user.role,
      phone: r.user.phone,
      unitName: r.user.orgUnit.name,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      onDuty: r.onDuty,
      updatedAt: r.updatedAt,
    }));
  }
}
