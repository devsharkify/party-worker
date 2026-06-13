import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type {
  AttendanceRow,
  CheckInResult,
  CreateEventDto,
  UpdateEventDto,
  EventItem,
  RsvpResult,
  RsvpStatus,
} from "@pw/shared";
import { SCORING } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { PushService } from "../push/push.service";

/** Points credited for a QR-verified event check-in (single source of truth in @pw/shared). */
const CHECKIN_POINTS = SCORING.EVENT_CHECKIN;

/** Workers must be within 500 m of the venue to geo-verify their check-in. */
const GEO_RADIUS_METRES = 500;

/** Haversine great-circle distance in metres. */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly push: PushService,
  ) {}

  /** Upcoming events (from yesterday onwards) with the viewer's RSVP + check-in state. */
  async listUpcoming(userId: string): Promise<EventItem[]> {
    const since = new Date(Date.now() - 24 * 3600_000);
    const events = await this.prisma.event.findMany({
      where: { startsAt: { gte: since } },
      orderBy: { startsAt: "asc" },
      include: {
        rsvps: { where: { userId }, select: { id: true, status: true } },
        checkIns: { where: { userId }, select: { id: true } },
      },
    });

    // Rsvp has no status column in the schema, so a row means the viewer responded.
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      location: e.location,
      lat: e.lat,
      lng: e.lng,
      qrToken: e.qrToken,
      orgUnitId: e.orgUnitId,
      rsvpStatus: e.rsvps[0] ? (e.rsvps[0].status as RsvpStatus) : null,
      checkedIn: e.checkIns.length > 0,
    }));
  }

  /** Admin: create an event with a server-generated unique QR token. */
  async create(dto: CreateEventDto): Promise<EventItem> {
    const qrToken = `evt_${randomBytes(16).toString("hex")}`;
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        startsAt: new Date(dto.startsAt),
        location: dto.location ?? null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        qrToken,
        orgUnitId: dto.orgUnitId ?? null,
      },
    });
    const item: EventItem = {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      lat: event.lat,
      lng: event.lng,
      qrToken: event.qrToken,
      orgUnitId: event.orgUnitId,
      rsvpStatus: null,
      checkedIn: false,
    };

    // Notify workers about the new event (fire-and-forget)
    const evTitle = "కొత్త కార్యక్రమం (New event)";
    if (event.orgUnitId) {
      void this.push.pushToOrgUnit(event.orgUnitId, evTitle, event.title).catch(() => undefined);
    } else {
      void this.push.pushToAllUsers(evTitle, event.title).catch(() => undefined);
    }

    return item;
  }

  /** Admin: update an event. */
  async update(id: string, dto: UpdateEventDto): Promise<EventItem> {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);
    const event = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.orgUnitId !== undefined && { orgUnitId: dto.orgUnitId }),
      },
    });
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      lat: event.lat,
      lng: event.lng,
      qrToken: event.qrToken,
      orgUnitId: event.orgUnitId,
      rsvpStatus: null,
      checkedIn: false,
    };
  }

  /** Admin: delete an event and its associated RSVPs and check-ins. */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);
    await this.prisma.$transaction([
      this.prisma.rsvp.deleteMany({ where: { eventId: id } }),
      this.prisma.checkIn.deleteMany({ where: { eventId: id } }),
      this.prisma.event.delete({ where: { id } }),
    ]);
  }

  /** Upsert the viewer's RSVP for an event. */
  async rsvp(userId: string, eventId: string, status: RsvpStatus): Promise<RsvpResult> {
    await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await this.prisma.rsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status },
      update: { status },
    });
    return { eventId, status };
  }

  /** Verify the QR token, create an idempotent check-in, and award points once. */
  async checkIn(
    userId: string,
    eventId: string,
    qrToken: string,
    userLat?: number,
    userLng?: number,
  ): Promise<CheckInResult> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    if (qrToken !== event.qrToken) {
      throw new BadRequestException("Invalid check-in token");
    }

    // Geo-fence: if the event has coordinates AND the worker sent theirs, enforce radius.
    let verified = true;
    if (event.lat != null && event.lng != null && userLat != null && userLng != null) {
      const dist = haversineMetres(userLat, userLng, event.lat, event.lng);
      if (dist > GEO_RADIUS_METRES) {
        throw new BadRequestException(
          `Too far from venue (${Math.round(dist)} m away; must be within ${GEO_RADIUS_METRES} m)`,
        );
      }
      verified = true;
    } else {
      // No coordinates available — allow but mark unverified.
      verified = false;
    }

    const existing = await this.prisma.checkIn.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing) {
      return { checkedIn: true, pointsAwarded: 0 };
    }

    await this.prisma.checkIn.create({
      data: {
        eventId,
        userId,
        lat: userLat ?? event.lat,
        lng: userLng ?? event.lng,
        verified,
      },
    });
    const award = await this.scoring.award(userId, "event_checkin", CHECKIN_POINTS, { eventId });
    return { checkedIn: true, pointsAwarded: award.pointsAwarded };
  }

  /** Leader/admin: who checked in to an event, with geo-verification flag. */
  async getAttendance(eventId: string): Promise<AttendanceRow[]> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException("Event not found");

    const checkIns = await this.prisma.checkIn.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, photoUrl: true } } },
    });

    return checkIns.map((c) => {
      let distanceMetres: number | null = null;
      if (event.lat != null && event.lng != null && c.lat != null && c.lng != null) {
        distanceMetres = Math.round(haversineMetres(c.lat, c.lng, event.lat, event.lng));
      }
      return {
        userId: c.user.id,
        name: c.user.name,
        photoUrl: c.user.photoUrl,
        checkedInAt: c.createdAt.toISOString(),
        verified: c.verified,
        distanceMetres,
      };
    });
  }
}
