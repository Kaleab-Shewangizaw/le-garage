import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

/**
 * Normalizes every error response to the shape documented in
 * docs/API.md §1: { error: { code, message, details } }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // AppError already produces { error: {...} }
      if (typeof body === "object" && body !== null && "error" in body) {
        response.status(status).json(body);
        return;
      }

      const message = typeof body === "string" ? body : (body as { message?: string }).message;
      response.status(status).json({
        error: {
          code: HttpStatus[status] ?? "ERROR",
          message: Array.isArray(message) ? message.join("; ") : message ?? "Request failed",
        },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
}
