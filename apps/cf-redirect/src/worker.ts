export interface Env {
  API_BASE_URL: string;
  CF_WEBHOOK_SECRET: string;
}

/**
 * Known crawler/bot UA substrings. Requests from these user agents are NOT
 * counted as real reach — they are link-preview fetches from messaging apps
 * or SEO crawlers. The list mirrors the regex used in the NestJS ReachService.
 */
const CRAWLER_UA_SUBSTRINGS: string[] = [
  "Googlebot",
  "Twitterbot",
  "facebookexternalhit",
  "WhatsApp",
  "TelegramBot",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "AhrefsBot",
  "SemrushBot",
  "BingPreview",
  "PetalBot",
  "YandexBot",
  "DotBot",
  "MJ12bot",
];

function isCrawler(ua: string): boolean {
  const lower = ua.toLowerCase();
  return CRAWLER_UA_SUBSTRINGS.some((sub) => lower.includes(sub.toLowerCase()));
}

/**
 * Resolve the destination URL for a tracked link token.
 * Times out after 1.5 s. On failure returns null so the caller can fall back.
 */
async function fetchDestination(
  apiBase: string,
  token: string,
  secret: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${apiBase}/r/${token}/dest`, {
      headers: {
        "x-cf-secret": secret,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { url: string };
    return body.url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget impression hit to the NestJS webhook.
 * Wrapped in ctx.waitUntil so it does not block the redirect response.
 */
function buildHitPromise(
  apiBase: string,
  token: string,
  secret: string,
  ip: string,
  ua: string,
  ref: string,
): Promise<void> {
  return fetch(`${apiBase}/r/${token}/hit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cf-secret": secret,
    },
    body: JSON.stringify({ ip, ua, ref, ts: new Date().toISOString() }),
  }).then(() => undefined);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Only handle /r/:token — everything else bounces to the main site.
    const match = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (!match) {
      return Response.redirect("https://yourparty.com", 302);
    }

    const token = match[1];
    const ip = request.headers.get("CF-Connecting-IP") ?? "";
    const ua = request.headers.get("User-Agent") ?? "";
    const ref = request.headers.get("Referer") ?? "";

    // Attempt to resolve the destination URL with a 1.5 s budget.
    const destUrl = await fetchDestination(env.API_BASE_URL, token, env.CF_WEBHOOK_SECRET);

    // Fallback: let the origin API handle the redirect itself.
    const redirectTarget =
      destUrl ?? `${env.API_BASE_URL}/r/${token}`;

    // Count only real humans — skip link-preview crawlers.
    if (!isCrawler(ua)) {
      ctx.waitUntil(
        buildHitPromise(env.API_BASE_URL, token, env.CF_WEBHOOK_SECRET, ip, ua, ref),
      );
    }

    return Response.redirect(redirectTarget, 302);
  },
};
