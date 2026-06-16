import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";

const POLL_VOTE_POINTS = 2;

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async create(dto: { question: string; optionA?: string; optionB?: string; orgUnitId?: string; endsAt: string }, createdById: string) {
    return this.prisma.poll.create({
      data: {
        question: dto.question,
        optionA: dto.optionA ?? "అవును / Yes",
        optionB: dto.optionB ?? "కాదు / No",
        orgUnitId: dto.orgUnitId ?? null,
        createdById,
        endsAt: new Date(dto.endsAt),
      },
    });
  }

  async list(orgUnitId?: string) {
    const now = new Date();
    return this.prisma.poll.findMany({
      where: {
        endsAt: { gte: now },
        ...(orgUnitId ? { orgUnitId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { votes: true } } },
    });
  }

  async results(pollId: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { _count: { select: { votes: true } } },
    });
    if (!poll) throw new NotFoundException("Poll not found");

    const [aCount, bCount, myVote] = await Promise.all([
      this.prisma.pollVote.count({ where: { pollId, choice: "A" } }),
      this.prisma.pollVote.count({ where: { pollId, choice: "B" } }),
      this.prisma.pollVote.findUnique({ where: { pollId_userId: { pollId, userId } } }),
    ]);

    return {
      id: poll.id,
      question: poll.question,
      optionA: poll.optionA,
      optionB: poll.optionB,
      endsAt: poll.endsAt,
      totalVotes: poll._count.votes,
      aCount,
      bCount,
      myChoice: myVote?.choice ?? null,
    };
  }

  async vote(pollId: string, userId: string, choice: "A" | "B") {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException("Poll not found");
    if (poll.endsAt < new Date()) throw new ConflictException("Poll has ended");

    try {
      await this.prisma.pollVote.create({ data: { pollId, userId, choice } });
    } catch {
      throw new ConflictException("Already voted");
    }

    void this.scoring.award(userId, "poll_vote" as any, POLL_VOTE_POINTS, { pollId }).catch(() => undefined);

    return this.results(pollId, userId);
  }
}
