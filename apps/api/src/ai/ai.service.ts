import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_ENV, type Env } from "../config/env";

const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  /**
   * Translate `text` from `from` language code to `to` language code using
   * Sarvam AI (IndicTrans2). If the API key is absent or the call fails,
   * returns the original text unchanged.
   */
  async translate(text: string, from: string, to: string): Promise<string> {
    if (!this.env.SARVAM_API_KEY) {
      this.logger.warn("SARVAM_API_KEY not set — returning original text");
      return text;
    }

    try {
      const res = await fetch(SARVAM_TRANSLATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": this.env.SARVAM_API_KEY,
        },
        body: JSON.stringify({
          input: text,
          source_language_code: from,
          target_language_code: to,
          speaker_gender: "Male",
          mode: "formal",
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Sarvam translate API returned ${res.status} — falling back to original`);
        return text;
      }

      const data = (await res.json()) as { translated_text?: string };
      return data.translated_text ?? text;
    } catch (err) {
      this.logger.warn(`Sarvam translate call failed: ${(err as Error).message} — falling back to original`);
      return text;
    }
  }

  /**
   * Generate a WhatsApp-ready caption for a creative.
   * If lang='te', the base English caption is translated to Telugu via Sarvam.
   * If lang='en', the English caption is returned directly.
   */
  async generateCaption(creativeTitle: string, lang: "te" | "en"): Promise<string> {
    const baseCaption = `Share this message: ${creativeTitle} | Join our movement! 🙏 #TelanganaForward`;

    if (lang === "en") {
      return baseCaption;
    }

    // Translate the full caption to Telugu
    return this.translate(baseCaption, "en-IN", "te-IN");
  }
}
