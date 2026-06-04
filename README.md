# Party Worker — Creator Factory

Turn party workers into a self-amplifying media network: HQ posts a creative once,
each worker's phone stamps **their own face + name + booth** onto it on-device, they
share to WhatsApp/Instagram with one tap, and earn **reach-weighted points** that climb
booth → mandal → constituency → district → state leaderboards.

Telangana-focused. **Telugu (default) + English.** India-compliant (DPDP, MCMC, AI-label).

## Surfaces (one product)

| App | Stack | Runs on |
| --- | --- | --- |
| `apps/app` | **Expo Router** (React Native, New Arch, TS) | **Web + iOS + Android from one codebase** — login + screens are identical |
| `apps/admin` | Next.js (App Router) + Tailwind + shadcn/ui | HQ content studio, template designer, compliance gate, analytics |
| `apps/api` | NestJS (Fastify) + Prisma + Redis/BullMQ | Shared REST/OpenAPI backend |
| `packages/shared` | TS types, zod schemas, i18n (te/en) | Consumed by all three |

> The worker website and the native apps are the **same Expo Router code**, so the OTP
> login behaves identically everywhere. Next.js is used **only** for the HQ admin.

## Every integration is faked in dev

No real keys needed to demo. Each external service sits behind an interface with a
dev/fake implementation, selected by env var:

| Concern | Interface | Dev default | Real option |
| --- | --- | --- | --- |
| OTP SMS | `OtpProvider` | `fake` (code `000000`) | MSG91 |
| Object storage | `StorageProvider` | `local` (disk) | Cloudflare R2 / Backblaze B2 |
| Push | `PushProvider` | `mock` (console) | FCM |
| Social posting | `PostingProvider` | AssistedShare + IG `mock` | Instagram Graph |
| Payments | `PaymentProvider` | `mock` (auto-approve) | Razorpay |

## Prerequisites

- Node 20+ and pnpm 9 (`corepack prepare pnpm@9.15.9 --activate`)
- PostgreSQL 16 and Redis running locally
  - This machine already runs both via `brew services` (postgres@16, redis).
  - Or use the bundled `docker compose up -d`.

## Quick start

```bash
cp .env.example .env          # defaults already point at local postgres + redis
pnpm install
pnpm db:push                  # create schema
pnpm db:seed                  # demo org tree + users + creatives + templates
pnpm dev                      # api + app(web) + admin via turbo
```

Then:

- **API + OpenAPI docs:** http://localhost:4000/docs
- **Worker app (web):** http://localhost:8081 — log in with any seeded phone, OTP `000000`
- **HQ admin:** http://localhost:3000

### Demo loop

1. Admin (`:3000`) → Studio → upload a creative with Telugu + English captions → pass the
   MCMC + AI-label compliance gate → Publish.
2. Worker app (`:8081`) → log in → the creative appears in the feed, personalized with the
   worker's photo + name + booth.
3. Tap **Share** → AssistedShare opens the native sheet with a tracked link in the caption.
4. Taps on that link are counted as reach → points are awarded → leaderboard updates.

## Per-app docs

- [apps/api](apps/api/README.md)
- [apps/app](apps/app/README.md)
- [apps/admin](apps/admin/README.md)

## Compliance notes (do not bypass)

- **MCMC:** when `MCMC_MODE=on`, publishing un-certified political content is blocked at the
  creative/template level (not just a UI toggle).
- **AI label:** every personalized/AI render burns a non-removable label covering at least
  `AI_LABEL_MIN_AREA_PCT` (default 10%) of the visual area, per the 2025 IT Rules amendment.
- **DPDP:** granular purpose-specific consent, 18+ age gate, Telugu consent notices, data-rights
  endpoints. No Aadhaar, no voter-roll scraping, no purchased lists.

## In parallel (not blocking, track separately)

- Start **Meta App Review** + Business Verification (content publishing + insights).
- **TRAI DLT registration** for SMS sender ID + templates (5–7 day lead time).
- YouTube API quota audit if/when video distribution is added.
