import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  WEB_APP_URL: z.string().default("http://localhost:8081"),
  ADMIN_URL: z.string().default("http://localhost:3000"),
  PUBLIC_LINK_BASE: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(5184000),
  COOKIE_DOMAIN: z.string().default("localhost"),

  OTP_PROVIDER: z.enum(["fake", "msg91", "authkey"]).default("fake"),
  DEV_OTP_CODE: z.string().default("000000"),
  // Demo/test numbers (seeded accounts) bypass real SMS and accept DEV_OTP_CODE,
  // so the demo keeps working even when a real SMS provider is live.
  OTP_BYPASS_PREFIX: z.string().default("+91900000"),
  // Authkey.io SMS (https://authkey.io) — used when OTP_PROVIDER=authkey.
  AUTHKEY_API_KEY: z.string().default(""),
  AUTHKEY_SID: z.string().default("35306"),
  AUTHKEY_COMPANY: z.string().default("Party Worker"),
  AUTHKEY_COUNTRY_CODE: z.string().default("91"),

  STORAGE_PROVIDER: z.enum(["local", "r2", "b2"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  STORAGE_PUBLIC_BASE: z.string().default("http://localhost:4000/media"),

  PUSH_PROVIDER: z.enum(["mock", "fcm"]).default("mock"),
  INSTAGRAM_PROVIDER: z.enum(["mock", "graph"]).default("mock"),
  META_OAUTH_REDIRECT: z.string().default("http://localhost:4000/social/instagram/callback"),

  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  MEMBERSHIP_FEE_INR: z.coerce.number().default(100),

  MCMC_MODE: z.enum(["on", "off"]).default("on"),
  AI_LABEL_MIN_AREA_PCT: z.coerce.number().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}

export const APP_ENV = "APP_ENV";
