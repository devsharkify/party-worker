import { Injectable } from "@nestjs/common";
import { $Enums } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type ScoreReason = $Enums.ScoreReason;

/** Bilingual (Telugu / English) friendly label for an activity row. */
export interface ActivityLabel {
  te: string;
  en: string;
}

/** A single mapped activity-feed entry returned to the worker app. */
export interface ActivityItem {
  id: string;
  reason: ScoreReason;
  points: number;
  weeklyDelta: number;
  lifetimeDelta: number;
  createdAt: string;
  label: ActivityLabel;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** Friendly bilingual description for each scoring reason. */
const LABELS: Record<ScoreReason, ActivityLabel> = {
  share: { te: "షేర్ చేసినందుకు", en: "For sharing" },
  recruit_initial: { te: "కొత్త కార్యకర్తను చేర్చినందుకు", en: "For recruiting" },
  recruit_bonus: { te: "రిక్రూట్‌మెంట్ బోనస్", en: "Recruitment bonus" },
  event_checkin: { te: "ఈవెంట్ చెక్-ఇన్", en: "Event check-in" },
  grievance_file: { te: "ఫిర్యాదు నమోదు", en: "Filed a grievance" },
  grievance_resolve: { te: "ఫిర్యాదు పరిష్కారం", en: "Resolved a grievance" },
  streak: { te: "స్ట్రీక్ బోనస్", en: "Streak bonus" },
  decay: { te: "క్రియాశీలత తగ్గుదల", en: "Inactivity decay" },
  fraud_reversal: { te: "పాయింట్ల రద్దు", en: "Points reversed" },
};

const FALLBACK_LABEL: ActivityLabel = { te: "కార్యకలాపం", en: "Activity" };

function labelFor(reason: ScoreReason): ActivityLabel {
  return LABELS[reason] ?? FALLBACK_LABEL;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current user's score entries, newest first, mapped to bilingual items. */
  async getActivity(userId: string, limit = DEFAULT_LIMIT): Promise<ActivityItem[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT), MAX_LIMIT);

    const entries = await this.prisma.scoreEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });

    return entries.map((e) => ({
      id: e.id,
      reason: e.reason,
      points: e.points,
      weeklyDelta: e.weeklyDelta,
      lifetimeDelta: e.lifetimeDelta,
      createdAt: e.createdAt.toISOString(),
      label: labelFor(e.reason),
    }));
  }
}
