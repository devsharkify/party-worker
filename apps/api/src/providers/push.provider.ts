import { Injectable, Logger } from "@nestjs/common";

export const PUSH_PROVIDER = Symbol("PUSH_PROVIDER");

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  /**
   * Send to an explicit list of device tokens. Returns the tokens the provider
   * reports as permanently invalid — callers prune those from the DB. Token
   * resolution (user → devices) lives in PushService, not in providers.
   */
  sendToTokens(tokens: string[], msg: PushMessage): Promise<string[]>;
}

/** Dev provider: logs the would-be push. */
@Injectable()
export class MockPushProvider implements PushProvider {
  private readonly log = new Logger("MockPushProvider");
  async sendToTokens(tokens: string[], msg: PushMessage): Promise<string[]> {
    this.log.log(`push ${tokens.length} device(s) :: ${msg.title} — ${msg.body}`);
    return [];
  }
}
