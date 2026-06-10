import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  PORT: z.coerce.number().optional(),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  WEB_APP_URL: z.string().default("http://localhost:8081"),
  ADMIN_URL: z.string().default("http://localhost:3000"),
  PUBLIC_LINK_BASE: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  // 14 days. Web keeps the refresh token in an httpOnly cookie and rotates it
  // on every use (reuse detection revokes the family), so a shorter window
  // bounds the blast radius of a stolen token without hurting UX.
  JWT_REFRESH_TTL: z.coerce.number().default(1209600),
  // Optional. Leave UNSET on Railway: *.up.railway.app is on the Public
  // Suffix List, so browsers reject Domain=railway.app cookies entirely —
  // host-only cookies (no Domain attribute) are the only kind that work there.
  COOKIE_DOMAIN: z.string().optional(),

  // "fake"      — no SMS/WhatsApp, logs code to console (dev default)
  // "authkey"   — Authkey.io SMS gateway (requires AUTHKEY_* vars)
  // "whatsapp"  — Meta WhatsApp Business Cloud API (requires WHATSAPP_* vars)
  OTP_PROVIDER: z.enum(["fake", "msg91", "authkey", "whatsapp"]).default("fake"),
  DEV_OTP_CODE: z.string().default("000000"),
  // Demo/test numbers (seeded accounts) bypass real SMS and accept DEV_OTP_CODE,
  // so the demo keeps working even when a real SMS provider is live.
  OTP_BYPASS_PREFIX: z.string().default("+91900000"),
  // Master switch for ALL demo/test logins (admin bypass + OTP_BYPASS_PREFIX
  // range). MUST be unset/"false" in production — when off, every login goes
  // through the real SMS OTP provider with no backdoors.
  ALLOW_TEST_LOGINS: z.string().default("false"),
  // Authkey.io SMS (https://authkey.io) — used when OTP_PROVIDER=authkey.
  AUTHKEY_API_KEY: z.string().default(""),
  AUTHKEY_SID: z.string().default("35306"),
  AUTHKEY_COMPANY: z.string().default("myTRS"),
  AUTHKEY_COUNTRY_CODE: z.string().default("91"),

  // Meta WhatsApp Business Cloud API — used when OTP_PROVIDER=whatsapp.
  // Leave blank in dev; the provider will log a warning and skip delivery.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["local", "r2", "b2"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  STORAGE_PUBLIC_BASE: z.string().default("http://localhost:4000/media"),

  PUSH_PROVIDER: z.enum(["mock", "fcm"]).default("mock"),
  // Firebase Cloud Messaging — used when PUSH_PROVIDER=fcm.
  FCM_PROVIDER: z.string().optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  INSTAGRAM_PROVIDER: z.enum(["mock", "graph"]).default("mock"),
  META_OAUTH_REDIRECT: z.string().default("http://localhost:4000/social/instagram/callback"),
  // Meta Graph (Instagram) — used when INSTAGRAM_PROVIDER=graph. Empty in dev.
  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  INSTAGRAM_SCOPES: z
    .string()
    .default(
      "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,business_management",
    ),
  // 32+ char secret used to AES-256-GCM encrypt stored OAuth tokens.
  SOCIAL_TOKEN_ENC_KEY: z.string().default("dev-social-token-encryption-key-change-me!"),
  // Where the OAuth callback sends the user back (the app/admin) after linking.
  SOCIAL_CONNECT_RETURN_URL: z.string().default("http://localhost:8081/profile"),

  // Set PAYMENT_PROVIDER=razorpay to use Razorpay; also set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  MEMBERSHIP_FEE_INR: z.coerce.number().default(100),
  // Razorpay API credentials — required when PAYMENT_PROVIDER=razorpay.
  // Key ID and Key Secret from the Razorpay Dashboard (Settings > API Keys).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  MCMC_MODE: z.enum(["on", "off"]).default("on"),
  AI_LABEL_MIN_AREA_PCT: z.coerce.number().default(10),

  // Sarvam AI — used by AiService for translation/caption generation.
  // Leave blank in dev; service will return the original text as a fallback.
  SARVAM_API_KEY: z.string().optional(),

  // Shared secret checked by the /r/:id/hit and /r/:id/dest endpoints.
  // Must match CF_WEBHOOK_SECRET in wrangler.jsonc (or Workers secrets).
  CF_WEBHOOK_SECRET: z.string().default("dev-secret"),
});

export type Env = z.infer<typeof EnvSchema>;

/** Dev-default secrets that must never survive into production. */
const DEV_DEFAULT_SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: "dev-access-secret-change-me",
  JWT_REFRESH_SECRET: "dev-refresh-secret-change-me",
  SOCIAL_TOKEN_ENC_KEY: "dev-social-token-encryption-key-change-me!",
  CF_WEBHOOK_SECRET: "dev-secret",
};

export function loadEnv(): Env {
  const env = EnvSchema.parse(process.env);
  // Fail fast on boot if a production deploy is still running on dev secrets,
  // or if test-login backdoors are left enabled. Better a crash than a breach.
  if (env.NODE_ENV === "production") {
    const offenders: string[] = [];
    for (const [key, devValue] of Object.entries(DEV_DEFAULT_SECRETS)) {
      if ((env as Record<string, unknown>)[key] === devValue) offenders.push(key);
    }
    if (offenders.length) {
      throw new Error(
        `Refusing to boot in production with dev-default secrets: ${offenders.join(", ")}. Set real values.`,
      );
    }
    if (env.ALLOW_TEST_LOGINS === "true") {
      throw new Error(
        "ALLOW_TEST_LOGINS must not be 'true' in production — it enables OTP backdoors.",
      );
    }
  }
  return env;
}

export const APP_ENV = "APP_ENV";

/**
 * "Prod-like" = production OR staging. Drives HTTPS-only cookies, SameSite=None
 * (cross-site web↔API), and HSTS — anything deployed behind HTTPS needs these.
 * Distinct from the strict `NODE_ENV === "production"` check that disables
 * test-login backdoors: a staging/demo box is prod-like for transport security
 * but may still allow test logins.
 */
export const isProdLike = (env: Env): boolean => env.NODE_ENV !== "development";
