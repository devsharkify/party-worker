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

## On-device video banner (share screen)

- Reels shared to WhatsApp/IG/YT get the `WorkerBanner` (1080x240 strip) burned
  on-device via ffmpeg-kit — zero server render load. Flow: hidden WorkerBanner
  → `captureRef` PNG → `compositeVideoWithBanner` (overlay+libopenh264) → MP4.
- **ffmpeg-kit is RETIRED.** The npm JS wrapper `ffmpeg-kit-react-native@6.0.2`
  still installs, but the native AAR (`com.arthenica:ffmpeg-kit-min-gpl`) was
  pulled from Maven Central AND is 4 KB-aligned (crashes Android 15+, Play
  rejects). `apps/app/android/build.gradle` substitutes it with the 16 KB
  rebuild `com.moizhassan.ffmpeg:ffmpeg-kit-16kb:6.1.1` (Maven Central, same
  `com.arthenica.ffmpegkit` namespace). Do NOT revert to the arthenica/Aliyun
  coordinate — it's a Play blocker.
- **This fork is built `--enable-gpl --enable-libopenh264 --enable-libvpx
  --enable-mediacodec` — it has NO libx264** (verified by scanning the AAR's
  libavcodec configure string). `-c:v libx264` fails at runtime with "Unknown
  encoder 'libx264'". Use `-c:v libopenh264 -b:v 5M` (software H.264, in the
  build). `h264_mediacodec` (hardware) also exists but ffmpeg's mediacodec
  ENCODER is flaky across cheap devices — prefer openh264.
- FFmpeg cmd gotchas baked into `composite.video.ts`: `-loop 1` on the still
  banner (else `overlay+shortest` → 1-frame 0.03s clip); `scale2ref` so the
  banner matches any reel width; map `[outv]` not `0:v:0`; `-map 0:a:0?` for
  silent reels. Verified locally with ffmpeg-static on 1080 + 720 sources.
- Capture waits for the worker photo's `onLoad` (expo-image is async) before
  `captureRef`, else the banner burns in the placeholder circle, not the face.
