import { BadRequestException, Injectable } from "@nestjs/common";
import type { CheckInResult, EventItem, RsvpResult, RsvpStatus } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

/** Points credited for a QR-verified event check-in. */
const CHECKIN_POINTS = 15;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  /** Upcoming events (from yesterday onwards) with the viewer's RSVP + check-in state. */
  async listUpcoming(userId: string): Promise<EventItem[]> {
    const since = new Date(Date.now() - 24 * 3600_000);
    const events = await this.prisma.event.findMany({
      where: { startsAt: { gte: since } },
      orderBy: { startsAt: "asc" },
      include: {
        rsvps: { where: { userId }, select: { id: true } },
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
      rsvpStatus: e.rsvps.length > 0 ? ("going" as RsvpStatus) : null,
      checkedIn: e.checkIns.length > 0,
    }));
  }

  /** Upsert the viewer's RSVP for an event. */
  async rsvp(userId: string, eventId: string, status: RsvpStatus): Promise<RsvpResult> {
    await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await this.prisma.rsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
      update: {},
    });
    return { eventId, status };
  }

  /** Verify the QR token, create an idempotent check-in, and award points once. */
  async checkIn(userId: string, eventId: string, qrToken: string): Promise<CheckInResult> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    if (qrToken !== event.qrToken) {
      throw new BadRequestException("Invalid check-in token");
    }

    const existing = await this.prisma.checkIn.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing) {
      return { checkedIn: true, pointsAwarded: 0 };
    }

    await this.prisma.checkIn.create({
      data: { eventId, userId, lat: event.lat, lng: event.lng, verified: true },
    });
    const award = await this.scoring.award(userId, "event_checkin", CHECKIN_POINTS, { eventId });
    return { checkedIn: true, pointsAwarded: award.pointsAwarded };
  }
}
