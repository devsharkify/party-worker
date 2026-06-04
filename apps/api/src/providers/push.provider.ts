import { Injectable, Logger } from "@nestjs/common";

export const PUSH_PROVIDER = Symbol("PUSH_PROVIDER");

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  sendToTopic(topic: string, msg: PushMessage): Promise<void>;
  sendToUser(userId: string, msg: PushMessage): Promise<void>;
}

/** Dev provider: logs the would-be FCM push. */
@Injectable()
export class MockPushProvider implements PushProvider {
  private readonly log = new Logger("MockPushProvider");
  async sendToTopic(topic: string, msg: PushMessage): Promise<void> {
    this.log.log(`push topic=${topic} :: ${msg.title} — ${msg.body}`);
  }
  async sendToUser(userId: string, msg: PushMessage): Promise<void> {
    this.log.log(`push user=${userId} :: ${msg.title} — ${msg.body}`);
  }
}
