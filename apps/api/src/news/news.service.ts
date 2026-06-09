import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 30) {
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
  }) {
    return this.prisma.newsItem.create({ data });
  }
}
