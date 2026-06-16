import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(limit = 30) {
    return this.prisma.newsItem.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
  }

  async listAll(limit = 50) {
    return this.prisma.newsItem.findMany({
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
  }

  async create(data: {
    handle: string;
    title: string;
    body: string;
    imageUrl?: string;
    sourceUrl?: string;
    publishedAt?: Date;
    status?: "draft" | "published";
  }) {
    return this.prisma.newsItem.create({ data });
  }

  async publish(id: string) {
    const item = await this.prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("News item not found");
    const updated = await this.prisma.newsItem.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    });
    // Push to all workers when manually published
    void this.push
      .pushToAllUsers(
        "📰 " + updated.title,
        updated.body.slice(0, 100),
        { type: "news_item", newsItemId: updated.id },
      )
      .catch(() => undefined);
    return updated;
  }

  /** Morning Brief: push the latest published headline to all workers. */
  async sendMorningBrief(): Promise<{ sent: boolean; title?: string }> {
    const latest = await this.prisma.newsItem.findFirst({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
    });
    if (!latest) return { sent: false };
    await this.push
      .pushToAllUsers(
        "📰 Good morning — " + latest.title,
        latest.body.slice(0, 100),
        { type: "morning_brief", newsItemId: latest.id },
      )
      .catch(() => undefined);
    return { sent: true, title: latest.title };
  }
}
