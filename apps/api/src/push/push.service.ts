import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PUSH_PROVIDER, type PushProvider } from "../providers/push.provider";
import { FirebasePushProvider } from "../providers/firebase-push.provider";

@Injectable()
export class PushService {
  private readonly log = new Logger("PushService");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /** Upsert a device token for the given user. */
  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  /** Remove a device token belonging to the given user. */
  async removeToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
  }

  /** Push a notification to all registered devices of a specific user. */
  async pushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const records = await this.prisma.deviceToken.findMany({ where: { userId } });
    const tokens = records.map((r) => r.token);
    if (tokens.length === 0) {
      this.log.debug(`pushToUser(userId=${userId}): no registered tokens`);
      return;
    }
    if (this.push instanceof FirebasePushProvider) {
      await this.push.sendMulticast(tokens, title, body, data);
    } else {
      await this.push.sendToUser(userId, { title, body, data });
    }
  }

  /** Push a notification to all users in a specific org unit. */
  async pushToOrgUnit(orgUnitId: string, title: string, body: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { orgUnitId },
      select: { id: true },
    });
    if (users.length === 0) return;

    const records = await this.prisma.deviceToken.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    const tokens = records.map((r) => r.token);
    if (tokens.length === 0) {
      this.log.debug(`pushToOrgUnit(orgUnitId=${orgUnitId}): no registered tokens`);
      return;
    }

    if (this.push instanceof FirebasePushProvider) {
      // FCM allows max 500 tokens per sendEachForMulticast call
      const CHUNK = 500;
      for (let i = 0; i < tokens.length; i += CHUNK) {
        await this.push.sendMulticast(tokens.slice(i, i + CHUNK), title, body);
      }
    } else {
      await this.push.sendToTopic(orgUnitId, { title, body });
    }
  }
}
