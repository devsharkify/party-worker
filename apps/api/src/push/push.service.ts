import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from "../providers/push.provider";

@Injectable()
export class PushService {
  private readonly log = new Logger("PushService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
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

  /** Send to explicit tokens and prune the ones the provider reports dead. */
  private async dispatch(tokens: string[], msg: PushMessage): Promise<void> {
    if (tokens.length === 0) return;
    const invalid = await this.push.sendToTokens(tokens, msg);
    if (invalid.length > 0) {
      await this.prisma.deviceToken
        .deleteMany({ where: { token: { in: invalid } } })
        .catch(() => undefined);
    }
  }

  /** Push a notification to all registered devices of a specific user. */
  async pushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const records = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (records.length === 0) {
      this.log.debug(`pushToUser(userId=${userId}): no registered tokens`);
      return;
    }
    await this.dispatch(records.map((r) => r.token), { title, body, data });
  }

  /**
   * Push to every user in the org unit's SUBTREE (a creative targeted at a
   * constituency must reach the workers sitting in its booth-level units).
   */
  async pushToOrgUnit(
    orgUnitId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const unitIds = await this.org.getDescendantIds(orgUnitId);
    const users = await this.prisma.user.findMany({
      where: { orgUnitId: { in: unitIds } },
      select: { id: true },
    });
    if (users.length === 0) return;

    const records = await this.prisma.deviceToken.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    if (records.length === 0) {
      this.log.debug(`pushToOrgUnit(orgUnitId=${orgUnitId}): no registered tokens`);
      return;
    }
    await this.dispatch(records.map((r) => r.token), { title, body, data });
  }

  /** Push a notification to every registered device (broadcast). */
  async pushToAllUsers(title: string, body: string, data?: Record<string, string>): Promise<void> {
    const PAGE = 500;
    let cursor: string | undefined;
    while (true) {
      const records = await this.prisma.deviceToken.findMany({
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, token: true },
        orderBy: { id: "asc" },
      });
      if (records.length === 0) break;
      await this.dispatch(records.map((r) => r.token), { title, body, data });
      cursor = records[records.length - 1]!.id;
      if (records.length < PAGE) break;
    }
  }
}
