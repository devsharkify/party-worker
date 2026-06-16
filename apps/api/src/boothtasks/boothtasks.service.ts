import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoringService } from "../scoring/scoring.service";
import { PushService } from "../push/push.service";

const TASK_COMPLETE_POINTS = 3;

@Injectable()
export class BoothTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly push: PushService,
  ) {}

  async create(
    dto: { title: string; description?: string; assignedToId?: string; dueAt?: string },
    createdById: string,
    orgUnitId: string,
  ) {
    const task = await this.prisma.boothTask.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        orgUnitId,
        assignedToId: dto.assignedToId ?? null,
        createdById,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });

    if (dto.assignedToId) {
      void this.push.pushToUser(
        dto.assignedToId,
        `📋 New task: ${dto.title}`,
        `Complete it to earn +${TASK_COMPLETE_POINTS} pts`,
        { type: "task_assigned", taskId: task.id },
      ).catch(() => undefined);
    }

    return task;
  }

  async list(orgUnitId: string) {
    return this.prisma.boothTask.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { completions: true } },
      },
    });
  }

  async myTasks(userId: string, orgUnitId: string) {
    const [tasks, completed] = await Promise.all([
      this.prisma.boothTask.findMany({
        where: { orgUnitId, OR: [{ assignedToId: userId }, { assignedToId: null }] },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.boothTaskCompletion.findMany({ where: { userId }, select: { taskId: true } }),
    ]);
    const doneIds = new Set(completed.map((c) => c.taskId));
    return tasks.map((t) => ({ ...t, done: doneIds.has(t.id) }));
  }

  async complete(taskId: string, userId: string, note?: string) {
    const task = await this.prisma.boothTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found");

    try {
      await this.prisma.boothTaskCompletion.create({ data: { taskId, userId, note: note ?? null } });
    } catch {
      throw new ConflictException("Already completed");
    }

    void this.scoring.award(userId, "task_complete" as any, TASK_COMPLETE_POINTS, { taskId }).catch(() => undefined);
    return { done: true };
  }

  async report(orgUnitId: string) {
    const tasks = await this.prisma.boothTask.findMany({
      where: { orgUnitId },
      include: { _count: { select: { completions: true } }, assignedTo: { select: { name: true } } },
    });
    const total = tasks.length;
    const completedCount = tasks.filter((t) => t._count.completions > 0).length;
    return { total, completedCount, pct: total > 0 ? Math.round((completedCount / total) * 100) : 0, tasks };
  }
}
