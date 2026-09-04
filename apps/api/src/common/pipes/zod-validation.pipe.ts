import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { AppError } from "../errors/app-error";

/**
 * Validates request bodies against a Zod schema at the API boundary
 * (docs/SECURITY.md §9). Usage: @Body(new ZodValidationPipe(createJobSchema)).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppError.badRequest("VALIDATION_ERROR", "Request body failed validation", {
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}
