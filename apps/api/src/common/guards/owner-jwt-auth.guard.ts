import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { OwnerAccessTokenPayload } from "@le-garage/types";
import { AppError } from "../errors/app-error";

/**
 * Authenticates owner-mobile sessions — completely separate from the
 * global staff `JwtAuthGuard` (docs/DECISIONS.md ADR-0020). Owner routes
 * are marked `@Public()` to skip the staff guard, then apply this one
 * explicitly. Verifying against `JWT_OWNER_ACCESS_SECRET` (not
 * `JWT_ACCESS_SECRET`) means a staff token fails signature verification
 * here outright — the two session kinds can't be confused for one
 * another even if a guard had a logic bug, not just by convention.
 */
@Injectable()
export class OwnerJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw AppError.unauthorized("UNAUTHENTICATED", "Missing bearer token");
    }

    const secret = process.env.JWT_OWNER_ACCESS_SECRET;
    if (!secret) {
      throw new Error("JWT_OWNER_ACCESS_SECRET is not configured");
    }

    try {
      const payload = await this.jwtService.verifyAsync<OwnerAccessTokenPayload>(token, { secret });
      (request as Request & { owner: OwnerAccessTokenPayload }).owner = payload;
      return true;
    } catch {
      throw AppError.unauthorized("INVALID_TOKEN", "Invalid or expired access token");
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
