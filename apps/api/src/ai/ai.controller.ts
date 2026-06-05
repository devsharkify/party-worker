import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AiService } from "./ai.service";

const translateBodySchema = z.object({
  text: z.string().min(1),
  from: z.string().default("en-IN"),
  to: z.string().default("te-IN"),
});

const captionBodySchema = z.object({
  title: z.string().min(1),
  lang: z.enum(["te", "en"]).default("te"),
});

type TranslateBody = z.infer<typeof translateBodySchema>;
type CaptionBody = z.infer<typeof captionBodySchema>;

@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** POST /ai/translate — translate text between languages. */
  @Post("translate")
  async translate(
    @Body(new ZodValidationPipe(translateBodySchema)) dto: TranslateBody,
  ): Promise<{ translated: string }> {
    const translated = await this.ai.translate(dto.text, dto.from, dto.to);
    return { translated };
  }

  /** POST /ai/caption — generate a WhatsApp-ready caption for a creative. */
  @Post("caption")
  async caption(
    @Body(new ZodValidationPipe(captionBodySchema)) dto: CaptionBody,
  ): Promise<{ caption: string }> {
    const caption = await this.ai.generateCaption(dto.title, dto.lang);
    return { caption };
  }
}
