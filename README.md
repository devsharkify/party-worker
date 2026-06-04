# Party Worker — Creator Factory

Party Worker is a Telugu-first platform that turns political party field workers
("karyakartas") in Telangana into a self-amplifying media network. HQ publishes a
compliance-cleared creative once; each worker's phone personalizes it on-device with
their own photo, name, and booth (plus a mandatory AI-content label), shares it to
WhatsApp/Instagram via a tracked link, and earns reach-weighted points that climb
booth → mandal → constituency → district → state leaderboards. It also issues digital
membership cards, runs events with QR check-in, collects citizen grievances, and gives
HQ an admin console for content and compliance. The platform is built for party HQ
content teams, leadership at every org level, and the workers themselves; the default
language is Telugu (`te`) with English (`en`) as fallback.

## Monorepo layout

A pnpm + turbo workspace (`pnpm-workspace.yaml`, `turbo.json`):

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS (Fastify) + Prisma + Postgres backend. All REST endpoints and the OpenAPI spec. |
| `apps/app` | Expo Router (React Native) worker app — one codebase ships to **web, iOS, and Android**. |
| `apps/admin` | Next.js (App Router) + Tailwind HQ console — content studio, MCMC/AI compliance gate, stats. |
| `packages/shared` | Shared TypeScript: domain enums, zod schemas, response types, the scoring spec, and the te/en i18n catalog. Consumed by all three apps. |

## Tech stack

- **API:** NestJS 11 on Fastify, Prisma 6 over PostgreSQL 16, ioredis for Redis. JWT auth
  (`@nestjs/jwt`), zod for validation, Swagger/OpenAPI at `/docs`. `bullmq`/`@nestjs/bullmq`
  are present as dependencies but not yet wired (see roadmap); background work currently
  uses a hand-rolled in-process interval.
- **Worker app:** Expo SDK 54 / Expo Router 6, React Native 0.81 (New Architecture), React 19,
  `react-native-web` for the web target, `expo-secure-store` (native refresh token),
  `react-native-qrcode-svg`, i18next + react-i18next.
- **Admin:** Next.js 15 App Router, React 19, Tailwind CSS.
- **Shared/tooling:** zod, i18next-compatible catalogs, TypeScript 5.7, pnpm 9.15, Turborepo 2.

## Features by domain

**Auth (`apps/api/src/auth`)** — phone + OTP login, JWT access + rotating refresh tokens,
per-route sliding-window rate limiting, role-based guards. Web stores the refresh token in
an httpOnly cookie; native clients receive it in the response body.

**Org & users (`org`, `users`)** — five-level org tree (state/district/constituency/mandal/
booth), seven roles (worker → booth/mandal/constituency/district leader → state/hq admin),
profile editing, photo upload (data-URL or multipart), and a QR membership card.

**Content studio (`creatives`, `compliance`)** — HQ uploads creatives with Telugu + English
caption variants, optional render template, and a target org subtree; MCMC certification and
a compliance-gated publish that pushes a notification to the target topic. Personalized renders
are AI-labeled by default.

**Templates (`creatives/templates`)** — named canvas templates with normalized (0..1) zones
(photo, name, designation, booth, logo, subtitle, ai_label). Admin-created; consumed by the
device to composite a personalized render.

**Feed & personalization (`feed`)** — org-scoped feed of published creatives with the viewer's
cached personalized render if present; the device reports its render (and may cache a data-URL
server-side) and signals device tier / server-fallback.

**Sharing & reach (`share`)** — one tracked "post" per (worker, creative); a `/r/:linkId`
redirect counts unique human taps (deduped per device per day), filters link-preview crawlers,
and awards reach-weighted points up to a cap.

**Scoring & leaderboards (`scoring`, `maintenance`)** — two currencies (lifetime reputation →
tier; weekly league points → league pool), multi-level leaderboards, a tier-matched ~30-person
weekly pool with promote/demote zones, weekly reset, and inactivity decay (daily in-process pass).

**Social (`social`)** — list/connect/disconnect Instagram (mock OAuth) and an insights sync that
awards reach points from Instagram numbers for connected Creator/Business accounts (personal/
unconnected accounts earn base points only).

**Payments (`payments`)** — start/verify a UPI membership payment; success flips
`membershipActive`. Dev provider auto-approves.

**Events (`events`)** — upcoming events, RSVP, and QR-verified check-in (idempotent, awards
points once). Admins create events with a server-generated QR token.

**Grievances (`grievances`)** — workers file citizen grievances (awards points); HQ admins list,
filter by status, and update workflow status (open → routed → in_progress → resolved/rejected).

**Admin (`admin`)** — aggregate stats, grievance queue, and scoring maintenance endpoints,
restricted to `hq_admin` / `state_admin`.

## Compliance

These rules live in code, not just the UI. See `apps/api/src/compliance/compliance.service.ts`
and `apps/api/src/share/reach.service.ts`.

- **MCMC pre-certification gate.** When `MCMC_MODE=on` (default), `ComplianceService.assertPublishable`
  blocks publishing any creative that is not MCMC-certified (`mcmcCertified=true`). Certification
  records an `mcmcCertId`. This is enforced in `CreativesService.publish`, so it cannot be skipped
  from the client.
- **Mandatory AI-content label (IT Rules 2025).** Every personalized/AI render must carry a
  non-removable label covering at least `AI_LABEL_MIN_AREA_PCT` (default 10%) of the visual area.
  Creatives are created with `aiLabeled=true`; publishing a creative with `aiLabeled=false` is
  rejected. `ComplianceService.labelSpec()` returns the spec the device uses to burn the label
  (the worker app renders a non-removable label band in `apps/app/app/personalize/[id].tsx`).
- **DPDP-minimizing reach.** Unique-tap dedup hashes are computed as
  `SHA256(ephemeral_daily_salt + truncated_IP + user_agent + linkId)`. The daily salt is held in
  memory only and dropped when the day rolls over, so hashes are not reversible. IPv4 is truncated
  to /24 and IPv6 to /48 before hashing. Link-preview crawlers (WhatsApp, Facebot, Telegram, etc.)
  are detected by user agent and served an OG page **without** being counted, so pasting a link
  never inflates reach. No Aadhaar, voter rolls, or purchased lists are used anywhere.

## Pluggable providers

Every external integration sits behind a TypeScript interface, wired by env var in
`apps/api/src/providers/providers.module.ts`. Today only dev/fake implementations exist — except
OTP, which can use the **real Authkey.io SMS** provider. Real implementations slot in behind the
same interface tokens with no changes to consumers.

| Concern | Interface | Dev default | Real option (env) |
| --- | --- | --- | --- |
| OTP SMS | `OtpProvider` | `FakeOtpProvider` (logs the code) | **Authkey.io** (`OTP_PROVIDER=authkey`) or msg91 (planned) |
| Object storage | `StorageProvider` | `LocalStorageProvider` (disk → `/media/*`) | R2 / B2 (planned) |
| Push | `PushProvider` | `MockPushProvider` (console) | FCM (planned) |
| Assisted share | `AssistedShareProvider` | `DefaultAssistedShareProvider` (always on, no creds) | — |
| Instagram Graph | `InstagramProvider` | `MockInstagramProvider` (deterministic insights) | Instagram Graph (planned) |
| Payments | `PaymentProvider` | `MockPaymentProvider` (auto-approve) | Razorpay (planned) |

**OTP in detail.** `OTP_PROVIDER=authkey` sends a generated 6-digit code via Authkey.io's
pre-approved template (`AUTHKEY_SID`). To keep the demo working without sending real SMS, any
number starting with `OTP_BYPASS_PREFIX` (default `+91900000`) skips the SMS path and accepts
`DEV_OTP_CODE` (default `000000`). All seeded demo numbers are `+91900000xxxx`, so they always
log in with `000000` even when a live SMS provider is configured. Never print real secrets; all
credentials are read from `.env` (see `.env.example`).

## Prerequisites

- Node 20+ and pnpm 9 (`corepack prepare pnpm@9.15.9 --activate`)
- PostgreSQL 16 and Redis running locally
  - via Homebrew: `brew services start postgresql@16` and `brew services start redis`, or
  - via the bundled `docker compose up -d`

## Setup

```bash
cp .env.example .env        # defaults already point at local Postgres + Redis
pnpm install
pnpm --filter @pw/api db:push    # create the schema (prisma db push)
pnpm --filter @pw/api db:seed    # seed org tree, users, creatives, template, event
```

The default `DATABASE_URL` in `.env.example` is
`postgresql://ruthlessravan@localhost:5432/party_worker?schema=public`; adjust the user/db to
match your local Postgres. The default OTP provider in `.env.example` is `authkey`, but with no
`AUTHKEY_API_KEY` set the seeded `+91900000xxxx` numbers still work via the bypass prefix. Set
`OTP_PROVIDER=fake` if you want every number to accept the dev code.

## Run

You can run everything together with turbo, or each app individually.

```bash
pnpm dev                    # api + app(web) + admin together (turbo run dev)
```

Individually:

| App | Command | URL |
| --- | --- | --- |
| API | `pnpm --filter @pw/api dev` | http://localhost:4000 — OpenAPI/Swagger at **/docs** |
| Worker app (web) | `pnpm --filter @pw/app web` | http://localhost:8081 |
| Admin | `pnpm --filter @pw/admin dev` | http://localhost:3000 |

Root shortcuts also exist: `pnpm dev:api`, `pnpm dev:app`, `pnpm dev:admin`. Native targets:
`pnpm --filter @pw/app ios` / `... android` (point `EXPO_PUBLIC_API_URL` at your machine's API).

## Seeded demo logins

`apps/api/prisma/seed.ts` creates a Telangana org tree (1 state, 2 districts, 4 constituencies,
8 mandals, 16 booths), 23 users, 5 creatives (4 published, 1 uncertified draft), one render
template, and one event with QR check-in. **Dev OTP is `000000`** for every seeded number.

| Phone | Name | Role |
| --- | --- | --- |
| `+919000000001` | HQ Admin | `hq_admin` |
| `+919000000002` | Ravi Teja | `state_admin` |
| `+919000000003` | Lakshmi Devi | `booth_leader` |
| `+919000000004` | Anil Kumar | `worker` (Instagram Creator connected) |
| `+919000000005` | Sai Kiran | `worker` (personal IG, base points only) |

Workers `…04` through `…23` exist with varied points; the admin console pre-fills
`9000000001`.

## Demo script

### Worker flow (web app at :8081)

1. Open http://localhost:8081 and log in as `+919000000004` (or `9000000004`), OTP `000000`.
2. **Feed** lists published creatives scoped to the worker's org. Tap one.
3. **Personalize** shows an on-device composite of the HQ asset + your photo / name / booth and
   a non-removable AI-label band; the render is reported to the API automatically.
4. Tap **Share** → a tracked link is generated, the base share point is awarded, and the OS share
   sheet / WhatsApp / Instagram / copy buttons open with the caption + link.
5. Open the tracked link (`http://localhost:4000/r/<linkId>`) in a normal browser to simulate a
   reach tap. Repeat from different "devices" (e.g. an incognito window) to add unique reach.
6. Back in the app, **Leaderboard** and the profile score reflect the reach-weighted points; switch
   levels booth → … → state.
7. **Events** tab: RSVP to "Booth Workers Meet" and tap check-in (the demo posts the event's own QR
   token) to earn check-in points.
8. **Grievances** tab: file a citizen grievance to earn filing points.
9. **Profile**: view the QR membership card and start a membership payment (mock auto-approves,
   flipping membership to active).

### HQ flow (admin at :3000)

1. Open http://localhost:3000 and log in as `+919000000001` (HQ Admin), OTP `000000`.
2. **New creative**: enter a title, type, Telugu + English captions, optionally upload a file, and
   create a draft.
3. On the draft card, enter an MCMC cert id and **Certify (MCMC)**.
4. **Publish** — blocked with a clear reason until the creative is certified (MCMC gate); once
   certified it publishes and a push is sent to the target org topic.
5. Log into the worker app and confirm the new creative appears in the **feed**.
6. Grievances inbox / events manager are exposed via the API — `GET /admin/grievances`,
   `PATCH /admin/grievances/:id`, `POST /events` — and via the dashboard stats strip; see
   `docs/ARCHITECTURE.md` for endpoints.
7. The dashboard stats strip shows creatives, published %, MCMC-certified count, templates, org
   units/booths, and member totals.

## Testing

```bash
pnpm --filter @pw/api test    # vitest run (~90 unit/service tests across 7 specs)
```

Tests live in `apps/api/test/*.spec.ts` and cover:

- **auth** — OTP request/rate-limit/bypass, verify (expiry, attempts, wrong code), token issuance,
  logout/refresh guards.
- **compliance** — env-derived getters, MCMC gate on/off, `assertPublishable`, label spec.
- **scoring** — award (weekly + lifetime + tier recompute), leaderboard/summary shaping; plus the
  shared spec (`computeSharePoints`, `tierForReputation`, `nextTierProgress`, `streakMultiplier`,
  `applyDecay`, threshold boundaries, constants integrity).
- **reach** — crawler detection, IP truncation (DPDP minimization), dedup + incremental award,
  destination resolution.
- **social** — Instagram sync gating, connected-creator awards, list/connect mapping.

## Scoring model

The single source of truth is `packages/shared/src/scoring.ts`. Two independent currencies:

- **`lifetimeReputation`** → never reset by the weekly cycle; maps to a **tier**.
- **`weeklyLeaguePoints`** → reset each league week; ranks you within a tier-matched pool.

Share points: `sharePoints = 2 + 0.1 × verifiedReach`, **capped at 30** (`computeSharePoints`).
The base 2 is awarded on share intent; reach taps then drive the total up to the cap incrementally.

Tiers on `lifetimeReputation` (highest first): **ratna** ≥ 15000, **nayak** ≥ 5000, **pramukh** ≥
2000, **sevak** ≥ 500, **karyakarta** ≥ 0.

Other awards (all sourced from `SCORING` in `@pw/shared`): event check-in `EVENT_CHECKIN` = 30,
grievance file `GRIEVANCE_FILE` = 15 / resolve `GRIEVANCE_RESOLVE` = 25, recruit bonuses,
daily streak (multiplier up to 1.5×). Weekly pool size 30, promote top 7,
demote bottom 5. **Inactivity decay** reduces `lifetimeReputation` by 2% per inactive week for
users idle > 7 days (lifetime only; weekly untouched), recomputing tier.

## Roadmap (Phase 2 / not yet built)

Honest status — much of the "real" surface is mocked or simplified:

- **Real on-device video compositing** — current personalization is an image overlay preview;
  video creatives are not composited yet.
- **Drag-and-drop template designer** — templates exist as data (zones), but there's no visual
  designer in the admin; templates are created via API/seed.
- **BullMQ-backed queues** — `bullmq` is a dependency but unused; decay/weekly-reset run on an
  in-process `setInterval` (`apps/api/src/maintenance`). Production should move these to a real
  scheduler/worker, and back rate-limiting with Redis.
- **Real provider implementations** — Storage (R2/B2), Push (FCM), Instagram Graph (publish +
  insights), Payments (Razorpay), and msg91 OTP are interface stubs/mocks today. Only Authkey.io
  SMS is real.
- **Instagram OAuth callback** — connect is a mock upsert; the `META_OAUTH_REDIRECT` callback
  route is not implemented.
- **Translation / AI assistant** — captions are authored manually in te/en; no automated
  translation or generation.

In parallel (track separately, not blocking the build): Meta App Review + Business Verification,
TRAI DLT registration for SMS sender id/templates, and a YouTube API quota audit if video
distribution is added.
