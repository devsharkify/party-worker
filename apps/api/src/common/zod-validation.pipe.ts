import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/** Validates/parses a payload against a zod schema. Use as `new ZodValidationPipe(schema)`. */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
