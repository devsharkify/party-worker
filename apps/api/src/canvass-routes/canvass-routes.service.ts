import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";

export interface RouteArea {
  address: string;
  landmark?: string;
  priority: number;
}

export interface CreateRouteDto {
  boothId: string;
  name: string;
  areas: RouteArea[];
}

export interface AssignRouteDto {
  workerId: string;
}

@Injectable()
export class CanvassRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(dto: CreateRouteDto, createdById: string) {
    const booth = await this.prisma.orgUnit.findUnique({ where: { id: dto.boothId } });
    if (!booth) throw new NotFoundException("Booth not found");

    return this.prisma.canvassRoute.create({
      data: {
        boothId: dto.boothId,
        name: dto.name,
        areas: dto.areas as object[],
        status: "unassigned",
      },
      include: {
        orgUnit: { select: { id: true, name: true } },
        worker: { select: { id: true, name: true } },
      },
    });
  }

  async listByBooth(boothId: string) {
    return this.prisma.canvassRoute.findMany({
      where: { boothId },
      orderBy: { createdAt: "desc" },
      include: {
        orgUnit: { select: { id: true, name: true } },
        worker: { select: { id: true, name: true } },
      },
    });
  }

  async assign(id: string, dto: AssignRouteDto) {
    const route = await this.prisma.canvassRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException("Route not found");

    const worker = await this.prisma.user.findUnique({ where: { id: dto.workerId } });
    if (!worker) throw new NotFoundException("Worker not found");

    const updated = await this.prisma.canvassRoute.update({
      where: { id },
      data: {
        assignedTo: dto.workerId,
        status: "assigned",
      },
      include: {
        orgUnit: { select: { id: true, name: true } },
        worker: { select: { id: true, name: true } },
      },
    });

    void this.push
      .pushToUser(dto.workerId, `🗺 New canvass route: ${route.name}`, "Tap to view your assigned areas", {
        type: "route_assigned",
        routeId: id,
      })
      .catch(() => undefined);

    return updated;
  }

  async complete(id: string, userId: string) {
    const route = await this.prisma.canvassRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException("Route not found");
    if (route.assignedTo !== userId) {
      throw new ForbiddenException("You are not assigned to this route");
    }
    if (route.status === "completed") {
      return route;
    }

    return this.prisma.canvassRoute.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
      include: {
        orgUnit: { select: { id: true, name: true } },
        worker: { select: { id: true, name: true } },
      },
    });
  }
}
