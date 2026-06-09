import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { tierForReputation, type TemplateZone } from "@pw/shared";

const prisma = new PrismaClient();

/** Deterministic pseudo-random so the demo is stable across re-seeds. */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

async function clearAll() {
  // order respects FKs
  await prisma.reachHit.deleteMany();
  await prisma.reachEvent.deleteMany();
  await prisma.shareEvent.deleteMany();
  await prisma.personalizedRender.deleteMany();
  await prisma.poolMembership.deleteMany();
  await prisma.leaderboardPool.deleteMany();
  await prisma.scoreEntry.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.rsvp.deleteMany();
  await prisma.event.deleteMany();
  await prisma.grievance.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.template.deleteMany();
  await prisma.user.deleteMany();
  await prisma.orgUnit.deleteMany();
}

const PHOTO = (seed: string) =>
  `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(seed)}`;

async function main() {
  console.log("Seeding...");
  await clearAll();

  // --- Org tree: state -> 2 districts -> 2 constituencies -> 2 mandals -> 2 booths ---
  const state = await prisma.orgUnit.create({
    data: { name: "Telangana", type: "state" },
  });

  const booths: { id: string; name: string; path: string }[] = [];
  const constituencies: { id: string; name: string }[] = [];
  const mandalsAll: { id: string; name: string }[] = [];
  const districtsAll: { id: string; name: string }[] = [];

  const districtNames = ["Hyderabad", "Rangareddy"];
  for (const dn of districtNames) {
    const district = await prisma.orgUnit.create({
      data: { name: dn, type: "district", parentId: state.id },
    });
    districtsAll.push({ id: district.id, name: dn });
    for (let c = 1; c <= 2; c++) {
      const cname = `${dn} ${c === 1 ? "Central" : "North"}`;
      const constituency = await prisma.orgUnit.create({
        data: { name: cname, type: "constituency", parentId: district.id },
      });
      constituencies.push({ id: constituency.id, name: cname });
      for (let m = 1; m <= 2; m++) {
        const mname = `${cname} Mandal ${m}`;
        const mandal = await prisma.orgUnit.create({
          data: { name: mname, type: "mandal", parentId: constituency.id },
        });
        mandalsAll.push({ id: mandal.id, name: mname });
        for (let b = 1; b <= 2; b++) {
          const bname = `Booth ${booths.length + 1}`;
          const booth = await prisma.orgUnit.create({
            data: { name: bname, type: "booth", parentId: mandal.id },
          });
          booths.push({ id: booth.id, name: bname, path: `${cname} / ${mname}` });
        }
      }
    }
  }

  console.log(
    `Org tree: 1 state, ${districtsAll.length} districts, ${constituencies.length} constituencies, ${mandalsAll.length} mandals, ${booths.length} booths`,
  );

  // --- Users ---
  const demoLogins: string[] = [];
  let phoneCounter = 0;
  const nextPhone = () => `+9190000000${String(++phoneCounter).padStart(2, "0")}`;

  // HQ + leadership
  const hq = await prisma.user.create({
    data: {
      phone: nextPhone(),
      name: "HQ Admin",
      photoUrl: PHOTO("hq"),
      designation: "State HQ",
      role: "hq_admin",
      orgUnitId: state.id,
      preferredLanguage: "en",
      membershipActive: true,
      lifetimeReputation: 20000,
      tier: "ratna",
    },
  });
  demoLogins.push(`${hq.phone}  HQ Admin (hq_admin)`);

  const stateAdmin = await prisma.user.create({
    data: {
      phone: nextPhone(),
      name: "Ravi Teja",
      photoUrl: PHOTO("stateadmin"),
      designation: "State President",
      role: "state_admin",
      orgUnitId: state.id,
      membershipActive: true,
      lifetimeReputation: 16000,
      tier: "ratna",
    },
  });
  demoLogins.push(`${stateAdmin.phone}  Ravi Teja (state_admin)`);

  // A booth leader on the first booth
  const firstBooth = booths[0]!;
  const boothLeader = await prisma.user.create({
    data: {
      phone: nextPhone(),
      name: "Lakshmi Devi",
      photoUrl: PHOTO("boothleader"),
      designation: "Booth President",
      role: "booth_leader",
      orgUnitId: firstBooth.id,
      membershipActive: true,
      lifetimeReputation: 6200,
      tier: tierForReputation(6200),
    },
  });
  demoLogins.push(`${boothLeader.phone}  Lakshmi Devi (booth_leader, ${firstBooth.name})`);

  // Workers spread across all booths with varied points
  const rand = rng(42);
  const workerNames = [
    "Anil Kumar", "Sai Kiran", "Priya Reddy", "Venkat Rao", "Sunitha",
    "Mahesh Babu", "Divya Sri", "Naresh", "Kavya", "Srinivas",
    "Manjula", "Rajesh", "Swathi", "Ganesh", "Padma",
    "Kiran", "Bhavani", "Ramesh", "Sravani", "Yadagiri",
  ];

  const workers: { id: string; phone: string; name: string; orgUnitId: string }[] = [];
  for (let i = 0; i < workerNames.length; i++) {
    const booth = booths[i % booths.length]!;
    const lifetime = Math.floor(rand() * 8000);
    const weekly = Math.floor(rand() * 220);
    const u = await prisma.user.create({
      data: {
        phone: nextPhone(),
        name: workerNames[i]!,
        photoUrl: PHOTO(`worker${i}`),
        designation: "Karyakarta",
        role: "worker",
        orgUnitId: booth.id,
        preferredLanguage: i % 4 === 0 ? "en" : "te",
        membershipActive: i % 3 !== 0,
        lifetimeReputation: lifetime,
        weeklyLeaguePoints: weekly,
        streakDays: Math.floor(rand() * 10),
        tier: tierForReputation(lifetime),
        lastActiveAt: new Date(Date.now() - Math.floor(rand() * 7) * 86400000),
      },
    });
    workers.push({ id: u.id, phone: u.phone, name: u.name, orgUnitId: booth.id });
  }
  // surface a couple of worker logins
  demoLogins.push(`${workers[0]!.phone}  ${workers[0]!.name} (worker)`);
  demoLogins.push(`${workers[1]!.phone}  ${workers[1]!.name} (worker)`);

  // Consent records (granted) for everyone so the app is demoable
  const allUsers = [hq, stateAdmin, boothLeader, ...workers.map((w) => ({ id: w.id }))];
  for (const u of allUsers) {
    for (const purpose of ["data_processing", "social_linking", "content_resharing", "location"] as const) {
      await prisma.consentRecord.create({
        data: { userId: u.id, purpose, granted: true, grantedAt: new Date() },
      });
    }
  }

  // A connected Instagram Creator account for the first worker (full points demo)
  await prisma.socialAccount.create({
    data: {
      userId: workers[0]!.id,
      platform: "instagram",
      type: "creator",
      handle: `${workers[0]!.name.split(" ")[0]!.toLowerCase()}_official`,
      connected: true,
      accessTokenEnc: "mock-encrypted-token",
    },
  });
  // A personal (unconnected) IG for the second worker (base points only)
  await prisma.socialAccount.create({
    data: {
      userId: workers[1]!.id,
      platform: "instagram",
      type: "personal",
      connected: false,
    },
  });

  // --- Template ---
  const zones: TemplateZone[] = [
    { id: "photo", kind: "photo", x: 0.06, y: 0.62, w: 0.26, h: 0.26, rotation: 0, shape: "circle" },
    { id: "name", kind: "name", x: 0.35, y: 0.66, w: 0.6, h: 0.08, rotation: 0, fontSize: 54, color: "#ffffff", align: "left" },
    { id: "designation", kind: "designation", x: 0.35, y: 0.74, w: 0.6, h: 0.05, rotation: 0, fontSize: 30, color: "#ffd54a", align: "left" },
    { id: "booth", kind: "booth", x: 0.35, y: 0.80, w: 0.6, h: 0.05, rotation: 0, fontSize: 28, color: "#ffffff", align: "left" },
    { id: "logo", kind: "logo", x: 0.82, y: 0.04, w: 0.12, h: 0.07, rotation: 0 },
    { id: "ai_label", kind: "ai_label", x: 0.0, y: 0.93, w: 1.0, h: 0.07, rotation: 0, fontSize: 22, color: "#ffffff", align: "center" },
  ];
  const template = await prisma.template.create({
    data: {
      name: "Standard Portrait Banner",
      canvasWidth: 1080,
      canvasHeight: 1920,
      zones: zones as unknown as object,
      createdById: hq.id,
    },
  });

  // --- Creatives ---
  // Published creative (MCMC-certified) -> appears in worker feed
  await prisma.creative.create({
    data: {
      title: "Manifesto Launch 2026",
      type: "image",
      sourceKey: "https://placehold.co/800x1200/0b1f3a/ff9933/png?text=Manifesto%0A2026",
      thumbnailKey: "https://placehold.co/800x1200/0b1f3a/ff9933/png?text=Manifesto%0A2026",
      templateId: template.id,
      captionVariants: {
        te: "మన మేనిఫెస్టో విడుదలైంది! ప్రతి ఇంటికీ అభివృద్ధి. #తెలంగాణ_అభివృద్ధి",
        en: "Our manifesto is here! Development for every home. #DevelopmentForAll",
      },
      languages: ["te", "en"],
      mcmcCertified: true,
      mcmcCertId: "MCMC/TG/2026/00123",
      aiLabeled: true,
      createdById: hq.id,
      published: true,
      publishedAt: new Date(),
    },
  });

  // Published video creative — real 15s sample mp4 for demo/testing
  await prisma.creative.create({
    data: {
      title: "CM Address — Welfare Schemes",
      type: "video",
      // Publicly available 15s sample video (Big Buck Bunny excerpt, Google CDN).
      // Replace with a real Party video URL in production.
      sourceKey: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      thumbnailKey: "https://placehold.co/800x450/138808/ffffff/png?text=CM+Welfare%0AAddress",
      templateId: template.id,
      captionVariants: {
        te: "ముఖ్యమంత్రి సందేశం: సంక్షేమ పథకాలు అందరికీ చేరాలి.",
        en: "CM's message: welfare schemes must reach everyone.",
      },
      languages: ["te", "en"],
      mcmcCertified: true,
      mcmcCertId: "MCMC/TG/2026/00124",
      aiLabeled: true,
      videoDurationSec: 15,
      createdById: hq.id,
      published: true,
      publishedAt: new Date(Date.now() - 3600_000),
    },
  });

  // Draft (NOT certified) -> blocked from publishing while MCMC mode is on
  await prisma.creative.create({
    data: {
      title: "Draft — Rally Invite (uncertified)",
      type: "image",
      sourceKey: "https://placehold.co/800x1200/8b0000/ffd54a/png?text=Maha%0ASabha",
      thumbnailKey: "https://placehold.co/800x1200/8b0000/ffd54a/png?text=Maha%0ASabha",
      captionVariants: { te: "మహా బహిరంగ సభకు రండి!", en: "Join the grand public meeting!" },
      languages: ["te", "en"],
      mcmcCertified: false,
      aiLabeled: true,
      createdById: hq.id,
      published: false,
    },
  });

  // Voter awareness (published)
  await prisma.creative.create({
    data: {
      title: "Voter Awareness Drive",
      type: "image",
      sourceKey: "https://placehold.co/800x1200/1d4ed8/ffffff/png?text=Your+Vote%0AYour+Voice",
      thumbnailKey: "https://placehold.co/800x1200/1d4ed8/ffffff/png?text=Your+Vote%0AYour+Voice",
      templateId: template.id,
      captionVariants: {
        te: "మీ ఓటు మీ హక్కు. జూన్ 15న ఓటు వేయండి! #ఓటు_వేయండి",
        en: "Your vote, your right. Vote on June 15! #GoVote",
      },
      languages: ["te", "en"],
      mcmcCertified: true,
      mcmcCertId: "MCMC/TG/2026/00131",
      aiLabeled: true,
      createdById: hq.id,
      published: true,
      publishedAt: new Date(Date.now() - 7200_000),
    },
  });

  // Women empowerment scheme (published)
  await prisma.creative.create({
    data: {
      title: "Mahila Shakti Scheme",
      type: "image",
      sourceKey: "https://placehold.co/800x1200/7c3aed/ffffff/png?text=Mahila%0AShakti",
      thumbnailKey: "https://placehold.co/800x1200/7c3aed/ffffff/png?text=Mahila%0AShakti",
      templateId: template.id,
      captionVariants: {
        te: "మహిళలకు నెలకు ₹2500. మహిళా శక్తి పథకం అమలులో ఉంది!",
        en: "₹2,500/month for women. The Mahila Shakti scheme is now live!",
      },
      languages: ["te", "en"],
      mcmcCertified: true,
      mcmcCertId: "MCMC/TG/2026/00132",
      aiLabeled: true,
      createdById: hq.id,
      published: true,
      publishedAt: new Date(Date.now() - 1800_000),
    },
  });

  // Rally speech video (second video creative)
  await prisma.creative.create({
    data: {
      title: "Grand Rally — Hyderabad",
      type: "video",
      sourceKey: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      thumbnailKey: "https://placehold.co/800x450/0b1f3a/ffd54a/png?text=Grand%0ARally",
      captionVariants: {
        te: "హైదరాబాద్ మహాసభ: ప్రజల హక్కుల కోసం పోరాటం. #జయహో",
        en: "Grand rally, Hyderabad: fighting for people's rights. #JayaHo",
      },
      languages: ["te", "en"],
      mcmcCertified: true,
      mcmcCertId: "MCMC/TG/2026/00133",
      aiLabeled: true,
      videoDurationSec: 10,
      createdById: hq.id,
      published: true,
      publishedAt: new Date(Date.now() - 900_000),
    },
  });

  // --- An event with QR check-in ---
  await prisma.event.create({
    data: {
      title: "Booth Workers Meet",
      description: "Weekly booth coordination meeting.",
      startsAt: new Date(Date.now() + 2 * 86400000),
      location: "Community Hall, Hyderabad Central",
      lat: 17.385,
      lng: 78.4867,
      qrToken: "evt_demo_qr_001",
      orgUnitId: constituencies[0]!.id,
    },
  });

  console.log("\nDemo logins (OTP = 000000 in dev):");
  for (const l of demoLogins) console.log("  " + l);
  // Seed news items
  await prisma.newsItem.deleteMany();
  const newsItems = [
    {
      handle: "@KCRofficial",
      title: "KCR addresses farmers on crop support scheme expansion",
      body: "Chief Minister K. Chandrashekar Rao announced a significant expansion of the Rythu Bandhu scheme, increasing per-acre support by 15% for the upcoming Kharif season. The announcement was made at a farmers' meet in Warangal attended by over 10,000 farmers from across Telangana.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=KCR+Rythu+Bandhu",
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
    {
      handle: "@TRS_Party",
      title: "TRS wins by-elections in 4 constituencies with strong mandate",
      body: "Telangana Rashtra Samithi secured decisive victories in four assembly by-elections held across the state. Party president KCR credited the win to the public's trust in welfare governance and the landmark schemes delivered over the past decade.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=TRS+Victory",
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      handle: "@MinistryOfIT_TS",
      title: "Hyderabad ranked No. 1 tech hub for second consecutive year",
      body: "The IT corridor in HITEC City recorded record investments of ₹18,500 crore in Q1 2026, placing Hyderabad ahead of Bengaluru in new tech park absorption. The Telangana IT minister credited state policy continuity and the T-Hub ecosystem for the achievement.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=Hyderabad+IT+Hub",
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
    {
      handle: "@KCRofficial",
      title: "Mission Bhagiratha reaches 100% household coverage in Telangana",
      body: "Mission Bhagiratha, the flagship safe drinking water project, has achieved complete household coverage across all 33 districts of Telangana. The project, which began in 2016, has transformed water access for over 2.8 crore households in rural and semi-urban areas.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=Mission+Bhagiratha",
      publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    },
    {
      handle: "@TRS_Party",
      title: "Party workers felicitated at State Conference in Hyderabad",
      body: "Over 50,000 party workers gathered at the HICC Novotel grounds for the annual State Party Conference. Top performers from each constituency were awarded the 'Karyakarta Ratna' honour. KCR urged workers to strengthen grassroots connect ahead of the local body polls.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=State+Conference",
      publishedAt: new Date(Date.now() - 14 * 60 * 60 * 1000),
    },
    {
      handle: "@TelanganaCMO",
      title: "State cabinet clears ₹2,400 crore package for urban infrastructure",
      body: "The Telangana cabinet approved a comprehensive urban infrastructure package focusing on roads, stormwater drains, and parks across 10 major municipal corporations. The works are to be completed before the monsoon season, with zonal committees overseeing execution.",
      imageUrl: "https://placehold.co/800x450/0b1f3a/ff9933?text=Urban+Infra+Package",
      publishedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
    },
  ];
  for (const item of newsItems) {
    await prisma.newsItem.create({ data: item });
  }
  console.log(`Seeded ${newsItems.length} news items`);

  console.log(`\nTotal users: ${await prisma.user.count()}  | creatives: ${await prisma.creative.count()} (4 published, 1 draft)`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
