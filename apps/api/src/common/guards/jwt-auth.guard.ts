import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AccessTokenPayload } from "@le-garage/types";
import { AppError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Global auth guard (docs/AUTH.md §4 step 1). Validates the bearer JWT and
 * attaches the decoded payload to req.user. Routes opt out via @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw AppError.unauthorized("UNAUTHENTICATED", "Missing bearer token");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      (request as Request & { user: AccessTokenPayload }).user = payload;
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
