import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";

@Injectable()
export class CrisisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async activate(dto: { title: string; message: string; orgUnitId?: string }, userId: string) {
    const alert = await this.prisma.crisisAlert.create({
      data: { title: dto.title, message: dto.message, createdById: userId, orgUnitId: dto.orgUnitId ?? null },
    });

    const pushTitle = `🚨 CRISIS: ${dto.title}`;
    const pushBody = dto.message.slice(0, 200);
    const data = { type: "crisis_alert", alertId: alert.id };

    if (dto.orgUnitId) {
      void this.push.pushToOrgUnit(dto.orgUnitId, pushTitle, pushBody, data).catch(() => undefined);
    } else {
      void this.push.pushToAllUsers(pushTitle, pushBody, data).catch(() => undefined);
    }

    return alert;
  }

  async resolve(id: string) {
    const alert = await this.prisma.crisisAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException("Alert not found");
    return this.prisma.crisisAlert.update({ where: { id }, data: { resolvedAt: new Date() } });
  }

  async listActive() {
    return this.prisma.crisisAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  }
}
