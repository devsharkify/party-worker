# Architecture

Deeper, code-referenced notes on the Party Worker backend. Paths are relative to the repo root.
The API is a single NestJS (Fastify) app (`apps/api/src/app.module.ts`); the worker app
(`apps/app`, Expo Router) and admin (`apps/admin`, Next.js) are thin clients over its REST API.
Domain enums, zod schemas, response types, and the scoring spec are shared via `packages/shared`
and imported by all three (`@pw/shared`).

## Data model

The Prisma schema is `apps/api/prisma/schema.prisma`. Enums there mirror
`packages/shared/src/enums.ts` exactly. Key models and relations:

### Org hierarchy

- **`OrgUnit`** — self-referential tree (`parentId` → `parent`/`children`) typed by `OrgUnitType`
  (`state | district | constituency | mandal | booth`). `OrgService` (`apps/api/src/org/org.service.ts`)
  loads all units once and computes descendant ids, ancestor chains, and the ancestor at a given
  level in memory — the basis for feed scoping and multi-level leaderboards.

### Users & auth

- **`User`** — `phone` (unique) + `name`, `role` (`Role`), `tier` (`Tier`), `preferredLanguage`,
  the two score currencies (`lifetimeReputation`, `weeklyLeaguePoints`), `streakDays`,
  `lastActiveAt`, `membershipActive`, a self-relation for recruiting (`recruitedBy`/`recruits`),
  and `orgUnitId` → `OrgUnit`. Fans out to renders, share events, score entries, consents,
  payments, refresh tokens, pool memberships, RSVPs, check-ins, grievances, and authored
  creatives/templates.
- **`RefreshToken`** — `tokenHash` (unique, sha256), `familyId`, `revoked`, `expiresAt`. Enables
  rotation + family revocation on reuse.
- **`OtpChallenge`** — `phone`, `codeHash`, `attempts`, `consumed`, `expiresAt`.
- **`SocialAccount`** — one per `(userId, platform)`; `connected`, `type`
  (`personal | creator | business`), encrypted token columns.

### Content

- **`Template`** — `canvasWidth/Height` + `zones` (JSON array of `TemplateZone`, normalized 0..1).
- **`Creative`** — `type` (`image | video | carousel`), `sourceKey`/`thumbnailKey` (storage keys
  or absolute URLs), optional `templateId`, `captionVariants` (JSON, te/en), `languages`,
  compliance flags `mcmcCertified` + `mcmcCertId` + `aiLabeled`, optional `targetOrgUnitId` (publish
  scope), `published`/`publishedAt`. Indexed on `published` and `targetOrgUnitId`.
- **`PersonalizedRender`** — unique per `(userId, creativeId)`; `deviceTier`, optional `cachedUrl`,
  `usedServerFallback`.

### Sharing & reach

- **`ShareEvent`** — unique `trackedLinkId`; one row per `(userId, creativeId)`. `basePointsAwarded`
  tracks the running total awarded so reach increments stay capped.
- **`ReachEvent`** — aggregate per `(shareEventId, source)` where `source` is `whatsapp_link` or
  `instagram_insights`; `uniqueCount` drives scoring, plus `views/likes/comments` and `awardedPoints`.
- **`ReachHit`** — dedup ledger; unique `(trackedLinkId, dedupHash, day)`. `dedupHash` is a
  non-reversible hash of an ephemeral daily salt + truncated IP + UA + link id (see reach pipeline).

### Scoring & leaderboards

- **`ScoreEntry`** — append-only ledger; `reason` (`ScoreReason`), `points`, `weeklyDelta`,
  `lifetimeDelta`, optional `meta`.
- **`LeaderboardPool`** / **`PoolMembership`** — schema scaffolding for sealed weekly pools
  (`tier`, `weekStart`, promote/demote flags). The live pool view is currently computed on the fly
  by tier cohort rather than read from these tables.

### Events, grievances, consent, payments

- **`Event`** (+ **`Rsvp`**, **`CheckIn`**) — `qrToken` (unique), optional geo + `orgUnitId`;
  RSVP and check-in are unique per `(eventId, userId)`.
- **`Grievance`** — `status` (`GrievanceStatus`), `filedBy` / optional `routedTo` (both → `User`),
  `resolvedAt`.
- **`ConsentRecord`** — unique per `(userId, purpose)` (`ConsentPurpose`), with grant/revoke
  timestamps (DPDP purpose-specific consent).
- **`Payment`** — `amountInr`, `status` (`PaymentStatus`), `provider`, `providerRef`, `paidAt`.

## Request / auth flow

Implemented in `apps/api/src/auth/*` and consumed by `apps/app/src/auth/*`.

### OTP → JWT

1. `POST /auth/request-otp` (`AuthController`, rate-limited via `RateLimitGuard` +
   `@RateLimit({ limit: 8, windowMs: 10m })`). `AuthService.requestOtp` also enforces a 5-per-hour
   cap per phone. For `OTP_PROVIDER=fake` or numbers starting with `OTP_BYPASS_PREFIX`, it stores
   `DEV_OTP_CODE` and skips SMS; otherwise it generates a 6-digit code and calls `OtpProvider.send`.
   Only the sha256 hash of the code is persisted (`OtpChallenge.codeHash`).
2. `POST /auth/verify-otp` → `AuthService.verifyOtp` finds the newest unconsumed, unexpired
   challenge, checks attempts and the code hash, consumes it, and requires a registered `User`
   (unknown numbers are rejected — workers are provisioned by leaders, not self-signup). It then
   issues tokens.
3. **Token issuance** (`issueTokens`): a short-lived **access JWT** (`{ sub, role, typ:"access" }`,
   `JWT_ACCESS_SECRET`, default 15 min) and a **refresh JWT** (`{ sub, familyId, jti, typ:"refresh" }`,
   `JWT_REFRESH_SECRET`, default 60 days) whose sha256 hash is stored in `RefreshToken`.

### Web cookie vs native SecureStore

`AuthController.verifyOtp` branches on the request's `client` field (`web` | `native`, from
`verifyOtpSchema`):

- **web** — the refresh token is set as an **httpOnly** cookie (`REFRESH_COOKIE`, `sameSite=lax`,
  `secure` in production, `COOKIE_DOMAIN`) and never returned to JS. The access token lives only in
  memory in the client (`accessRef` in `apps/app/src/auth/auth-context.tsx`).
- **native** — the refresh token is returned in the response body and stored in the device keychain
  via `expo-secure-store` (`apps/app/src/auth/token-store.ts`); web's `tokenStore` is a no-op.

### Refresh rotation & reuse detection

`POST /auth/refresh` → `AuthService.refresh`. The token comes from the cookie (web) or the body
(native). It is verified, then looked up by hash. If missing/revoked/expired, the **entire token
family** (`familyId`) is revoked as a replay precaution and the call is rejected. Otherwise the
current record is revoked, and a fresh access + refresh pair is issued reusing the same `familyId`
(rotation). The client (`auth-context.tsx`) transparently retries a 401 once via `/auth/refresh`.

### Guards

- **`JwtAuthGuard`** — verifies the `Bearer` access token, asserts `typ==="access"`, and sets
  `req.user = { id, role }`. `@CurrentUser()` reads it.
- **`RolesGuard`** + **`@Roles(...)`** — checks `req.user.role` against required roles. Used to
  restrict `creatives`, `templates` (POST), admin endpoints, and event creation to
  `hq_admin` / `state_admin`.
- **`RateLimitGuard`** — in-memory, per-route, per-IP sliding window (process-local; would move to
  Redis in multi-instance prod). Baseline security headers are added globally in `main.ts`.

## Reach pipeline

The reach-weighted award path is the core of the gamification. Files:
`apps/api/src/share/share.service.ts`, `redirect.controller.ts`, `reach.service.ts`, and the
shared `computeSharePoints` in `packages/shared/src/scoring.ts`.

1. **Share intent** — `POST /share` (`ShareController` → `ShareService.share`). The first share of a
   `(worker, creative)` creates a `ShareEvent` with a unique `trackedLinkId`
   (`<userTail>-<creativeTail>-<nanoid>`), awards the base 2 points
   (`SCORING.SHARE_BASE`), and returns the **tracked link**
   `${PUBLIC_LINK_BASE}/r/<trackedLinkId>` plus the localized caption (caption + link) and channel
   deep links from `AssistedShareProvider`. Re-sharing only updates the channel/timestamp — the base
   point is awarded once.
2. **Tracked link** — the worker posts the caption (with the link) to WhatsApp/Instagram via the OS
   share sheet (`apps/app/app/share/[id].tsx`).
3. **`/r/:linkId` redirect** — `RedirectController` resolves the destination (the worker's cached
   personalized render if any, else the creative's source URL) via `ReachService.resolveDestination`.
   - **Crawler filtering** — if the user agent matches the crawler regex (WhatsApp, facebookexternalhit,
     Telegram, etc.), it returns a lightweight OG/HTML page and **does not count** the hit. This keeps
     link-unfurl previews from inflating reach.
   - **Human tap** — otherwise `ReachService.recordTap` runs and the visitor is `302`-redirected.
4. **Dedup** — `recordTap` computes
   `dedupHash = sha256(daily_salt + truncate(IP) + userAgent + linkId)` and inserts a `ReachHit`
   unique on `(trackedLinkId, dedupHash, day)`. A unique-constraint violation means the same device
   already counted today → not counted again. The daily salt is generated on demand, kept only in an
   in-memory map, and older days are evicted, so hashes are **not reversible** (DPDP minimization);
   IPv4 is truncated to /24, IPv6 to /48 before hashing.
5. **Reach-weighted award** — on a counted tap, the `whatsapp_link` `ReachEvent.uniqueCount` is
   incremented, then `awardReachDelta` awards only the **delta** between
   `computeSharePoints(reach) = min(30, 2 + 0.1 × reach)` and what was already credited
   (`ShareEvent.basePointsAwarded`), so the per-post total tracks the formula and is capped at 30.
   `ScoringService.award` writes the user totals (weekly + lifetime), recomputes tier, and appends a
   `ScoreEntry`.

**Instagram path** — `SocialService.syncInstagram` mirrors this for connected Creator/Business
accounts: it pulls insights via `InstagramProvider.getInsights` (mocked, deterministic) into an
`instagram_insights` `ReachEvent` and awards the same capped delta. Personal/unconnected accounts
are gated out and earn base points only.

## Provider-interface seam

All external I/O is abstracted behind interfaces in `apps/api/src/providers/*`, registered as a
`@Global()` module in `providers.module.ts`. Each interface has a symbol token; consumers inject the
token (`@Inject(STORAGE_PROVIDER) storage: StorageProvider`) and never reference a concrete class.

| Token | Interface | Methods | Dev impl |
| --- | --- | --- | --- |
| `OTP_PROVIDER` | `OtpProvider` | `send(phone, code)` | `FakeOtpProvider` / real `AuthkeyOtpProvider` |
| `STORAGE_PROVIDER` | `StorageProvider` | `put`, `publicUrl`, `signedUrl` | `LocalStorageProvider` |
| `PUSH_PROVIDER` | `PushProvider` | `sendToTopic`, `sendToUser` | `MockPushProvider` |
| `ASSISTED_SHARE` | `AssistedShareProvider` | `buildDeepLinks` | `DefaultAssistedShareProvider` |
| `INSTAGRAM_PROVIDER` | `InstagramProvider` | `publish`, `getInsights` | `MockInstagramProvider` |
| `PAYMENT_PROVIDER` | `PaymentProvider` | `createOrder`, `verify` | `MockPaymentProvider` |

**How a real implementation slots in.** `providers.module.ts` selects the class by env var, e.g.:

```ts
{ provide: OTP_PROVIDER,
  useClass: env.OTP_PROVIDER === "authkey" ? AuthkeyOtpProvider : FakeOtpProvider }
```

To add (say) Cloudflare R2 storage: implement `StorageProvider` in a new
`R2StorageProvider` class, then switch the `STORAGE_PROVIDER` provider to choose it when
`env.STORAGE_PROVIDER === "r2"`. No consumer (`CreativesService`, `FeedService`, `UsersService`,
`ShareService`, `ReachService`) changes, because they depend only on the interface. The env schema
(`apps/api/src/config/env.ts`) already enumerates the real options (`r2`/`b2`, `fcm`, `graph`,
`razorpay`, `msg91`); only the provider bindings and the impl classes remain to be written.

## Background work

`apps/api/src/maintenance/maintenance.service.ts` runs a guarded `setInterval` (daily) that calls
`ScoringService.applyDecayForInactive`. It is disabled when `NODE_ENV==='test'` and `unref()`s its
timer so it never keeps the process alive. `@nestjs/schedule` and `bullmq` are not used yet; in
production this work should move to a real scheduler/worker (see the README roadmap). Weekly league
reset (`ScoringService.resetWeekly`) and decay are also exposed as admin endpoints
(`POST /admin/scoring/weekly-reset`, `POST /admin/scoring/decay`).

## Endpoint map (selected)

All non-auth routes require a `Bearer` access token; admin/content routes additionally require
`hq_admin`/`state_admin`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Users | `GET /users/me`, `PATCH /users/me`, `POST /users/me/photo`, `GET /users/me/card` |
| Org | `GET /org/tree` |
| Creatives (admin) | `POST /creatives/upload`, `POST /creatives`, `GET /creatives`, `GET /creatives/:id`, `POST /creatives/:id/certify`, `POST /creatives/:id/publish` |
| Templates | `GET /templates`, `GET /templates/:id`, `POST /templates` (admin) |
| Feed | `GET /feed`, `GET /feed/:creativeId`, `POST /feed/:creativeId/render` |
| Share / reach | `POST /share`, `GET /r/:linkId` (public redirect) |
| Social | `GET /social`, `POST /social/instagram/connect`, `.../disconnect`, `.../sync` |
| Scoring | `GET /scoring/summary`, `GET /scoring/leaderboard?level=`, `GET /scoring/pool` |
| Payments | `POST /payments/membership/start`, `POST /payments/membership/verify` |
| Events | `GET /events`, `POST /events` (admin), `POST /events/:id/rsvp`, `POST /events/:id/checkin` |
| Grievances | `POST /grievances`, `GET /grievances/mine` |
| Admin | `GET /admin/stats`, `GET /admin/grievances?status=`, `PATCH /admin/grievances/:id`, `POST /admin/scoring/weekly-reset`, `POST /admin/scoring/decay` |
| Misc | `GET /health`, `GET /docs` (Swagger UI) |
