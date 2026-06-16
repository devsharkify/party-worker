import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  imageUrl: string | null;
}

interface NewsSource {
  handle: string;
  rssUrl: string;
  maxItems: number;
}

const SOURCES: NewsSource[] = [
  // Kalvakuntla Kavitha — direct coverage of TRS president and MLC
  {
    handle: "@KavithaTRS",
    rssUrl: "https://news.google.com/rss/search?q=%22Kalvakuntla+Kavitha%22&hl=en-IN&gl=IN&ceid=IN:en",
    maxItems: 10,
  },
  // Telangana Rakshana Samithi organisation news
  {
    handle: "@TelanganaRakshana",
    rssUrl: "https://news.google.com/rss/search?q=%22Telangana+Rakshana+Samithi%22+OR+%22TRS+Kavitha%22&hl=en-IN&gl=IN&ceid=IN:en",
    maxItems: 8,
  },
  // Kavitha's campaigns — Delhi liquor case, women rights, Telangana culture
  {
    handle: "@KavithaCampaigns",
    rssUrl: "https://news.google.com/rss/search?q=Kavitha+Telangana+culture+women+rights+MLC&hl=en-IN&gl=IN&ceid=IN:en",
    maxItems: 6,
  },
  // The Hindu Telangana — authoritative sourcing
  {
    handle: "@TheHindu",
    rssUrl: "https://www.thehindu.com/news/national/telangana/feeder/default.rss",
    maxItems: 6,
  },
];

// ─── Minimal RSS parser (zero deps) ─────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  // Handles CDATA and plain text
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    "i",
  );
  const m = re.exec(xml);
  if (!m) return "";
  const raw = (m[1] ?? m[2] ?? "").trim();
  // Decode HTML entities
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/<[^>]+>/g, "") // strip any residual HTML
    .trim();
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`, "i");
  const m = re.exec(xml);
  return m?.[1] ?? null;
}

function parseRss(xml: string, maxItems: number): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null && items.length < maxItems) {
    const blob = match[1];

    // Link: prefer <link> text, fall back to <guid> when <link> is a comment node
    const linkTag = /<link>([^<]+)<\/link>/i.exec(blob);
    const guidTag = /<guid[^>]*>([^<]+)<\/guid>/i.exec(blob);
    const link = (linkTag?.[1] ?? guidTag?.[1] ?? "").trim();

    if (!link) continue;

    const title = extractTag(blob, "title");
    if (!title) continue;

    let description = extractTag(blob, "description");
    // Google News descriptions often wrap a table — strip it
    if (description.length < 20) description = title;

    const pubDate = extractTag(blob, "pubDate") || null;

    // Image: try media:thumbnail, then enclosure, then og:image patterns
    const imageUrl =
      extractAttr(blob, "media:thumbnail", "url") ??
      extractAttr(blob, "enclosure", "url") ??
      extractAttr(blob, "media:content", "url") ??
      null;

    items.push({ title, link, description, pubDate, imageUrl });
  }

  return items;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NewsScraperService {
  private readonly log = new Logger(NewsScraperService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scrape(): Promise<{ fetched: number; saved: number; skipped: number }> {
    let fetched = 0;
    let saved = 0;
    let skipped = 0;

    for (const source of SOURCES) {
      try {
        const items = await this.fetchSource(source);
        fetched += items.length;

        for (const item of items) {
          const inserted = await this.upsertItem(item, source.handle);
          if (inserted) saved++;
          else skipped++;
        }
      } catch (err) {
        this.log.warn(`Failed to scrape ${source.handle}: ${(err as Error).message}`);
      }
    }

    return { fetched, saved, skipped };
  }

  private async fetchSource(source: NewsSource): Promise<RssItem[]> {
    const res = await fetch(source.rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; myTRS-newsbot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${source.rssUrl}`);
    }

    const xml = await res.text();
    const items = parseRss(xml, source.maxItems);
    this.log.debug(`${source.handle}: got ${items.length} items`);
    return items;
  }

  private async upsertItem(item: RssItem, handle: string): Promise<boolean> {
    // Dedup by exact URL
    const existing = await this.prisma.newsItem.findFirst({
      where: { sourceUrl: item.link },
      select: { id: true },
    });
    if (existing) return false;

    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
    // Clamp future dates to now
    const safeDate = publishedAt > new Date() ? new Date() : publishedAt;

    await this.prisma.newsItem.create({
      data: {
        handle,
        title: item.title.slice(0, 500),
        body: item.description.slice(0, 3000),
        imageUrl: item.imageUrl ?? null,
        sourceUrl: item.link,
        publishedAt: safeDate,
        status: "published",
      },
    });

    return true;
  }
}
