# party-worker (myTRS) — working notes for Claude

## Concurrent-session rule (important)

Multiple Claude sessions work on this repo in parallel. Your in-context file
copies go stale. **Re-read any file with the Read tool immediately before
editing it**, and run `git log --oneline -5` at session start to see what
landed since your context was built. Never write a file from a copy you read
before another session's commit.

## Do not clobber (2026-06-10)

- `apps/app/src/components/TRSLogo.tsx` and `apps/admin/src/TRSLogo.tsx`
  render the OFFICIAL uploaded TRS artwork PNGs. Do not revert to the old
  inline-SVG fallback.
- `apps/app/assets/trs-logo.png`, `apps/app/assets/trs-logo-square.png`,
  `apps/admin/public/trs-logo*.png` are the official party artwork
  (820x1066 full / 820x820 square). Do NOT regenerate or overwrite them.
  Fallback SVG sources + notes live in `docs/branding/`.
- `apps/app/dist` is the static web build served locally on :8090
  (`npx serve -s -p 8090 apps/app/dist`). Rebuild with
  `pnpm --filter @pw/app run export:web`. Gotcha: the export appends a stale
  second `entry-*.js` script tag in `dist/index.html` — keep only the newest
  entry that actually exists in `dist/_expo/static/js/web/`.

## Quick facts

- Monorepo: pnpm 9.15.9 + turbo; apps/{api,app,admin,cf-redirect}.
- Run: API `pnpm --filter @pw/api dev` (:4000) · worker web :8081 · admin :3000.
- Dev OTP 000000; logins +919000000001 (hq_admin), +919000000004 (worker).
- Deploys: API = `railway up --detach` run from MONOREPO ROOT (`/party-worker/`,
  NOT from `apps/api/`) — root has `railway.json` (forces NIXPACKS) and
  `pnpm-lock.yaml` (forces pnpm); running from `apps/api/` uses railpack+npm
  and fails with `EUNSUPPORTEDPROTOCOL workspace:*`; worker = `vercel deploy
  --prod --prebuilt` + alias mytrs-worker-app.vercel.app; admin = static export
  from apps/admin then alias admin-zeta-gold-53.vercel.app.
- Disk is ~96% full — avoid heavy installs; check `df -h /System/Volumes/Data`.
