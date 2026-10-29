import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AccessTokenPayload } from "@le-garage/types";
import { AppError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Global auth guard (docs/AUTH.md §4 step 1). Validates the bearer JWT and
 * attaches the decoded payload to req.user. Routes opt out via @Public().
 *
 * After the signature check it also confirms the token's staff membership
 * is still active and its organization isn't suspended (docs/ADMIN.md) —
 * one primary-key lookup per request — so deactivating someone or
 * suspending a company takes effect immediately rather than when the
 * 15-minute access token happens to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw AppError.unauthorized("INVALID_TOKEN", "Invalid or expired access token");
    }

    // Resolving the caller's own membership from a verified token — the
    // same identity-bootstrapping case prismaUnscoped exists for.
    const membership = await this.prisma.unscopedClient.staffMember.findUnique({
      where: { id: payload.staffMemberId },
      select: { active: true, organizationId: true, organization: { select: { suspendedAt: true } } },
    });
    if (!membership || !membership.active || membership.organizationId !== payload.organizationId) {
      throw AppError.unauthorized("STAFF_DEACTIVATED", "This account no longer has access");
    }
    if (membership.organization.suspendedAt) {
      throw AppError.forbidden("ORGANIZATION_SUSPENDED", "This organization's access is suspended — contact Le Garage support");
    }

    (request as Request & { user: AccessTokenPayload }).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
