import { Injectable } from "@nestjs/common";
import { ConsentPurpose } from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Bilingual (Telugu/English) label shown next to each consent toggle. */
export interface ConsentLabel {
  te: string;
  en: string;
}

/** Current state of a single DPDP consent purpose for a user. */
export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  label: ConsentLabel;
}

/** The four DPDP consent purposes, in display order. */
const PURPOSES: ConsentPurpose[] = [
  "data_processing",
  "social_linking",
  "content_resharing",
  "location",
];

/** Static bilingual labels per purpose (te = Telugu, en = English). */
const LABELS: Record<ConsentPurpose, ConsentLabel> = {
  data_processing: { te: "డేటా ప్రాసెసింగ్", en: "Data processing" },
  social_linking: { te: "సోషల్ ఖాతా లింకింగ్", en: "Linking social accounts" },
  content_resharing: { te: "కంటెంట్ రీషేరింగ్", en: "Re-sharing content" },
  location: { te: "స్థానం", en: "Location" },
};

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All four DPDP purposes with the user's current state. Purposes with no
   * stored record default to granted=false (opt-in, per DPDP Act 2023).
   */
  async listForUser(userId: string): Promise<ConsentState[]> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
    });
    const byPurpose = new Map(records.map((r) => [r.purpose, r]));
    return PURPOSES.map((purpose) => {
      const record = byPurpose.get(purpose);
      return {
        purpose,
        granted: record?.granted ?? false,
        grantedAt: record?.grantedAt ? record.grantedAt.toISOString() : null,
        revokedAt: record?.revokedAt ? record.revokedAt.toISOString() : null,
        label: LABELS[purpose],
      };
    });
  }

  /**
   * Upsert the consent record for (userId, purpose). Granting stamps
   * grantedAt=now (leaving any prior revokedAt); revoking stamps revokedAt=now.
   */
  async set(userId: string, purpose: ConsentPurpose, granted: boolean) {
    const now = new Date();
    const record = await this.prisma.consentRecord.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: {
        userId,
        purpose,
        granted,
        grantedAt: granted ? now : null,
        revokedAt: granted ? null : now,
      },
      update: granted ? { granted, grantedAt: now } : { granted, revokedAt: now },
    });
    return {
      purpose: record.purpose,
      granted: record.granted,
      grantedAt: record.grantedAt ? record.grantedAt.toISOString() : null,
      revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
      label: LABELS[record.purpose],
    };
  }
}
