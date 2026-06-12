# myTRS Growth & Usage Roadmap — 3-agent Fable audit, 2026-06-12

Three parallel analyses: codebase gap audit, India/Telangana ground-reality research (web-sourced), product strategy. Synthesized below.

## 0. Party identity & why now (CORRECTED 2026-06-13)

**The client party is Telangana Rakshana Sena (TRS) — K. Kavitha's new party, launched in Hyderabad on 2026-04-25** after her Sept 2025 suspension from BRS (announced as "Telangana Rashtra Sena"; the **ECI approved the official name "Telangana Rakshana Sena" on 2026-04-30**, retaining the TRS initials — [India TV](https://www.indiatvnews.com/telangana/news-election-commission-approves-telangana-rakshana-sena-as-official-name-for-k-kavitha-political-party-latest-updates-2026-04-30-1039475), [ANI](https://www.aninews.in/news/national/general-news/eci-approves-telangana-rakshana-sena-for-k-kavithas-party-retains-trs20260430143248/), [Asianet](https://newsable.asianetnews.com/india/k-kavitha-launches-new-party-telangana-rashtra-sena-in-hyderabad-articleshow-z6dmozc)). NOT BRS/KCR's former Telangana Rashtra Samithi — though the initials deliberately mirror it, and "myTRS" branding fits. The official logo artwork in the app already carries the correct name. Platform: "Panchajanya" five guarantees (Education, Health, Agriculture, Livelihood, Samajika Telangana); "Amma's Rule" positioning; stated goal = principal opposition within two years ([UNI](https://www.uniindia.com/kavitha-launches-telangana-rashtra-sena-unveils-five-guarantees-targets-ruling-opposition-parties/south/news/3822554.html)).

Strategic implications of being a ~7-week-old party:
- **Recruitment is existential**, not a feature. The invite-link flow, anti-bogus enrollment, and booth-coverage maps move UP the priority list — the party is building its org tree from zero, largely by poaching disaffected BRS cadre. Honest activity data (vs Shakti-style fake registrations) is the founder's only real picture of her org.
- **Content categories should map to Panchajanya**: tag creatives Education/Health/Agriculture/Livelihood/Samajika Telangana so HQ can balance the narrative mix; "Amma's Rule" gives the design language a motif.
- **Election calendar**: ZPTC/MPTC rural polls possibly June 2026 (notification unverified) — likely too soon; **GHMC + Cyberabad + Malkajgiri elections likely Nov–Dec 2026** (trifurcated Feb 2026, ECI roll revision ~Oct) = the party's FIRST electoral test, in its home base. Everything ships before October.
- Competitive backdrop: Feb 2026 municipal results Congress 1,537 wards / BRS 781 / BJP 336; BRS itself announced a digital membership-drive app (May 2026) — myTRS must out-execute it to win the cadre-experience battle for the same pool of workers.
- Cadre legal risk is real in Telangana (opposition social-media workers face dozens of FIRs). The approval/provenance trail is personal protection for a new party's workers, who have the least institutional cover.

## 1. CRITICAL — the core promise is broken (fix before anything else)

1. **The personalized image is never actually shared.** `share/[id].tsx:74-97` shares TEXT only (caption + tracked link); `share.service.ts` builds links from the original `creative.sourceKey`, not the worker's render. The face/name composite stays on the server. The entire value prop ("my face on the party poster in my WhatsApp") doesn't happen. Fix: share the rendered image file (native `Share.share` with url / web share API with files), Status-sized 1080x1920.
2. **Points fire on opening the share screen, not on sharing** (`share/[id].tsx:53-66`, POST /share in useEffect on mount, channel hardcoded `whatsapp_status`). Teaches workers that opening a screen = points; corrupts the leaderboard.
3. **Profile photo upload is web-only** (`profile.tsx:163-164` returns early on native). On the APK, personalization is faceless — the hook is dead on the platform that matters. Wire expo-image-picker.
4. **Push is dead end-to-end**: app registers *Expo* push tokens but `FirebasePushProvider` sends via firebase-admin (needs raw FCM tokens — all sends fail); two conflicting env keys (`PUSH_PROVIDER` vs `FCM_PROVIDER`); no client topic subscription; zero web push. Without push there is no daily loop.
5. **QR check-in is fake**: client posts back the `qrToken` the API already gave it in GET /events; one tap from home = +30 pts, no scan, no GPS. Inflates leaderboards and removes the show-up incentive.
6. **Weekly league reset is a manual admin button** — "weekly" isn't weekly unless someone clicks every Monday; pool promote/demote displayed but no job exists. Streaks: `streakDays` column + multiplier exist, **nothing increments it, no UI shows it** — fully dead. Recruit second-half bonus endpoint never triggered. Add BullMQ repeatables for all three.
7. **Storage is local disk on Railway** — uploaded creatives/renders/photos are **lost on every redeploy**. R2/B2 enum exists but provider is hardcoded LocalStorage. Must fix before real rollout.
8. **Sarvam fallback caption is English** even for `lang=te` (`ai.service.ts:57-66`) — Telugu users tap "AI Caption" and get English.

## 2. Built but buried (backend with no UI — cheap wins)

- **Video submission + approval workflow** (submit/mine/review/approve/reject endpoints live, verified e2e) — zero screens anywhere. Need: worker submit screen, my-submissions status, leader/HQ review queue. (Already on the TODO from Session 12.)
- **GET /team/stats** — richest leader analytics endpoint (active members, membership penetration, reach, tier mix, top performers per subtree) — **never called**; leader-dashboard recomputes a weaker version client-side.
- **POST /invites** — no UI to mint invite links; leaders onboard one-by-one via form while a viral self-register flow sits unused.
- **Leader announcements compose** — API allows booth→district leaders to broadcast to subtree; only admin web has UI. A mandal leader on a phone can't message his cadre.
- **Event attendance lists** — check-ins recorded, nobody can view them (no endpoint, no UI). Admin shows raw token, not even a printable QR.
- Razorpay UI calls verify immediately after start (works only against mock) — needs real Checkout step when going live.

## 3. The daily loop (what makes workers open it every morning)

The app is the **armory, not the battlefield** — workers live in WhatsApp; myTRS wins by giving a weapon WhatsApp can't: *a poster with your own face, fresh every morning*. 90-second loop: open → today's creative **pre-rendered with my face** → mission chip ("share today's poster, yesterday's reached 47 people") → share to Status → leaderboard delta ("you're 12 pts behind Ramesh") → streak ticks → leave.

Ranked mechanics (research-backed):
1. **Daily poster calendar** — festival/jayanti/leader-birthday/good-morning cards, auto-personalized. The RajNeta/Posto/DigitalPost category proves this is THE daily habit in Indian politics; Good Morning culture is the most underestimated surface. Pre-schedule a month via the existing scheduling module. Content cadence is the engine; every mechanic dies on a stale feed (Moj's decline).
2. **Leaderboard-movement pushes** — "Ramesh overtook you" in a 30-person pool of people you personally know. Blocked only on the FCM fix.
3. **Timed "Trend Alert" missions** — push with pre-filled caption + hashtag + countdown window + bonus. The most documented mechanic in Indian politics (69/75 BJP trend campaigns hit X trending — Digital Witness Lab).
4. **WhatsApp Status-first output** — every creative auto-rendered 1080x1920 vertical, one-tap "Set as Status". Status ≈ 32% of WhatsApp time in India.
5. **Streaks** (forgiving: 1 free skip/week) + **named badge ladder** (NaMo's 6 tiers → e.g. Booth Veerudu → Telangana Yodha) + merch/certificate redemption.
6. **Recognition from the top** — "Kavitha Samvad" style: top booth scorers named on camera by the party president at scheduled lives (NaMo's Mera Booth Sabse Majboot is the apex retention mechanic). Monthly physical felicitation with printed certificates — in cadre culture a garland beats 500 points.

## 4. The leader lever (top-down adoption — this is how you get installs)

A constituency in-charge forces 500 installs when the app gives HIM visibility upward + control downward:
- **Weekly auto-generated report card** as WhatsApp-forwardable image/PDF: "Serilingampally: 412/500 active (82%), 4,310 shares, 38.5k verified reach, 3 events, 27 issues. Rank #7 ↑2." He forwards it to the president; the report is his trophy and he becomes the app's unpaid salesman. ~90% of numbers already computed in teamstats + heatmap — needs render + weekly cron + share button.
- **Unit-vs-unit leaderboard** (constituency vs constituency) — leaders are more rank-hungry than workers.
- **Inactive-member call list** — "23 workers idle 7+ days", tap-to-call. Data exists (`lastActiveAt`), no UI.
- **Booth coverage gaps** — booths with zero active workers this week = election-readiness language every in-charge speaks. Directly serves the party's announced two-workers-per-booth drive.
- **Anti-bogus enrollment** — OTP + activity-based "verified active worker" status + dedupe. Congress's Project Shakti died of 75-80% fake registrations misleading the high command; honest numbers are a differentiator leadership will value.

## 5. Opposition-specific plays (Hyderabad)

- **Issues 2.0**: upgrade Grievance → civic Issue: photo + GPS + category (roads/water/drainage/GHMC/streetlights). 5,000 workers = a sensing network no opposition can otherwise afford. Aging unresolved issues auto-become posters ("Day 90: still no road — Ward 42"); weekly constituency failure report = press-meet ammo. **The single feature that converts the app from cadre toy into political instrument**, and perfectly timed for GHMC campaign.
- **Rapid-response lane**: "breaking" creative flag → push-to-all same day; pre-certify fill-in-the-blank template families (power cuts, flooded roads, price rise) so the MCMC compliance gate stops being a speed tax. Track HQ time-from-news-to-creative as SLA.
- **Event proof loop**: geo-tagged photo at check-in (also fixes fake check-ins) → auto-collage creative every attendee shares. Open event creation to constituency leaders for dharnas/flash protests.
- **Forward packs**: one tap copies poster + caption + link pre-phrased for 3 audiences (Status / family group / colony group).

## 6. Distribution & ops

- **Now**: APK-over-WhatsApp for cadre core (standard practice) + PWA for iPhone/desktop. Non-negotiables first: **lock a stable signing keystore** (future APKs must install over the top) and an **in-app update banner** → hosted download page.
- **expo-updates OTA** for JS-only changes daily; native APK monthly → EAS free-quota becomes a non-issue.
- **Play Store in parallel (4-8 weeks)**: org verification, data-safety form, political-content scrutiny in India, don't let membership card resemble govt ID, label news tab as party updates. iOS: defer (cadre is ~92% Android; web covers iPhone leaders).
- **TRAI DLT registration** before scale or SMS delivery collapses mid-rollout.
- **Rollout**: one pilot constituency with a bought-in in-charge, 2 weeks, fix loop, cascade district-by-district. Weekly report card becomes the meeting agenda; rank read aloud in a room → installs by Monday. 2-person HQ content desk owning ≥1 drop/day before any of this.
- **Low-end mode**: sub-1MB renders, feed thumbnails (currently 3-col grid downloads full-res sources), auto-cleanup of old creatives. Median cadre device = ₹4-5k Android with chronic storage exhaustion. Also: the personalize screen silently uploads a multi-MB base64 render on first open — defer until share intent.

## 7. Compliance & protection layer (legal shield, not checkbox)

- **IT Rules Amendment 2026** (effective 2026-02-20): synthetic/digitally-enhanced content needs visible on-screen labels; takedown window now 3 hours; ECI standard = label ≥10% of screen area + creator identity in metadata. Face-composited creatives plausibly qualify — conservative read: keep burning the label (already done) + add **per-asset provenance records** (who made, who approved, when).
- The approval workflow (Session 12) doubles as worker protection — cadres sharing only HQ-approved, provenance-tracked content have a defense when FIRs fly (TDP Seva Mitra / IT Grids prosecution is the cautionary precedent for data; Shakti for fake data).
- DPDP consent screen is still **English-only** (`onboarding/consent.tsx` ignores the complete Telugu catalog that already exists in shared i18n) — rules require Telugu. Trivial fix, real exposure.

## 8. i18n debt (Telugu-default app, English leaks)

English-only screens bypassing the i18n catalog: consent.tsx (worst — legal), my-videos.tsx, leader-dashboard.tsx, accept-invite/[token].tsx (a recruit's FIRST contact with the party is English), feed.tsx header/stats/empty states, news.tsx share strings, BannerShareModal, personalize video strings, ~24 strings in profile.tsx, server push bodies, AI caption fallback. Date formatting should use te-IN.

## 9. Priority roadmap

### This month (high impact, low cost)
1. Fix the core-loop bugs (§1: share the actual image, points-on-share, native photo upload, FCM end-to-end, scheduled weekly reset/streaks/recruit-bonus jobs, R2/B2 storage).
2. Ship the missing UI for the approval workflow (submit / my-submissions / review queue) — backend verified, on existing TODO.
3. Daily-drop discipline + "Today's Mission" banner; pre-render hero with worker's face at publish.
4. Weekly leader report card (teamstats + heatmap → forwardable image + cron).
5. Inactive-member call list + unit-vs-unit leaderboard in leader dashboard (wire dead /team/stats).
6. APK distribution kit: stable keystore, download page, in-app update banner, expo-updates OTA.
7. Telugu consent screen + worst i18n leaks.

### Next quarter (before GHMC campaign season)
8. Issues 2.0 (geo+photo+category capture, booth issue map, constituency failure report).
9. Rapid-response lane (breaking flag + pre-certified template families + SLA).
10. Event proof loop (geo-photo check-in fixes fake QR too + auto-collage) + leader event creation.
11. Trend Alert timed missions + Status-first 1080x1920 renders + forward packs.
12. Invite-link UI + leader announcements compose in app; event attendance lists.
13. Play Store listing; daily Telugu poster calendar (festival/jayanti/birthday) pre-scheduled.

### Later / optional
14. Badge ladder + merch/certificates + worker-of-the-week auto-cards; Kavitha-shout-out lives.
15. Real Razorpay membership checkout (donations much later — ECI receipting/optics); iOS build.
16. Real video compositing (posters carry the loop fine meanwhile); Telugu voice flows (voice-note grievances, TTS briefs) via Sarvam.

**Deliberately NOT doing**: citizen-facing app surfaces (citizens are reached through WhatsApp), in-app micro-donations now (opposition optics + ECI compliance), fighting WhatsApp groups (instrument them instead).

### HQ weekly metrics (all computable from existing models)
1. Weekly Active Workers % (ScoreEntry/lastActiveAt) 2. Share rate per drop (ShareEvent users ÷ active) 3. Verified external reach (ReachEvent.uniqueCount, WA vs IG split) 4. Booth coverage % (booths with ≥1 active worker) 5. Issue throughput (filed vs resolved, median resolution time).
