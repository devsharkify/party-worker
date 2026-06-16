import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";

@Injectable()
export class PosterCalendarService {
  private readonly log = new Logger(PosterCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Called daily at 06:00 IST — pushes any unsent calendar events for today. */
  async sendToday(): Promise<{ found: number; sent: number }> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

    const events = await this.prisma.posterCalendar.findMany({
      where: { date: { gte: todayStart, lt: tomorrowStart }, sentAt: null },
    });

    let sent = 0;
    for (const ev of events) {
      try {
        await this.push.pushToAllUsers(ev.pushTitle, ev.pushBody, {
          type: "calendar_event",
          calendarEventId: ev.id,
        });
        await this.prisma.posterCalendar.update({
          where: { id: ev.id },
          data: { sentAt: new Date() },
        });
        sent++;
      } catch (err) {
        this.log.warn(`Failed to push calendar event ${ev.id}: ${(err as Error).message}`);
      }
    }
    return { found: events.length, sent };
  }

  list() {
    return this.prisma.posterCalendar.findMany({ orderBy: { date: "asc" }, take: 200 });
  }

  create(data: { date: Date; title: string; pushTitle: string; pushBody: string; creativeId?: string }) {
    return this.prisma.posterCalendar.create({ data });
  }

  async remove(id: string) {
    await this.prisma.posterCalendar.delete({ where: { id } });
    return { deleted: true };
  }
}
