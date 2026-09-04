import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Application-level error carrying a stable machine-readable `code`
 * (docs/API.md §1). Controllers/services throw this (or one of the
 * factory helpers below) instead of raw NestJS exceptions so every error
 * response has the same shape.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, details } }, status);
  }

  static notFound(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, HttpStatus.NOT_FOUND, details);
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static forbidden(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, HttpStatus.FORBIDDEN, details);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static unauthorized(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED, details);
  }
}
