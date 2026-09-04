import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AccessTokenPayload } from "@le-garage/types";
import { Role } from "@le-garage/database";
import { AppError } from "../errors/app-error";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * RBAC guard (docs/AUTH.md §4 step 3). Routes with no @Roles(...) decorator
 * allow any authenticated staff member of the resolved tenant. Tenant
 * scoping itself is enforced at the service layer via organizationId
 * filters plus the Prisma tenant-scope extension (docs/SECURITY.md §2) —
 * this guard is authorization-by-role only.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized("UNAUTHENTICATED", "Missing authenticated user");
    }
    if (!requiredRoles.includes(user.role as Role)) {
      throw AppError.forbidden(
        "FORBIDDEN_ROLE",
        `Role ${user.role} is not permitted to perform this action`,
      );
    }
    return true;
  }
}
