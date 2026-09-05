import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import type { LoginInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { TokenService, type StaffContext, type TokenPair } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput): Promise<{ tokens: TokenPair; ctx: StaffContext }> {
    // Identity resolution by email/phone precedes any tenant context —
    // legitimately unscoped (see @le-garage/database's prismaUnscoped doc comment).
    const user = await this.prisma.unscopedClient.user.findFirst({
      where: { OR: [{ email: input.identifier }, { phone: input.identifier }] },
    });

    if (!user) {
      // Security event (docs/SECURITY.md §5, §8): a failed attempt against
      // an identifier with no matching account. No entityId to attach it
      // to, so it's recorded against the attempted identifier itself —
      // never the password.
      await this.audit.record({
        organizationId: null,
        entityType: "LoginAttempt",
        entityId: input.identifier,
        action: "LOGIN_FAILED_UNKNOWN_IDENTIFIER",
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/phone or password");
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      await this.audit.record({
        organizationId: null,
        entityType: "User",
        entityId: user.id,
        action: "LOGIN_FAILED_WRONG_PASSWORD",
        actorUserId: user.id,
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/phone or password");
    }

    const staffMember = await this.prisma.unscopedClient.staffMember.findFirst({
      where: { userId: user.id, active: true },
    });
    if (!staffMember) {
      await this.audit.record({
        organizationId: null,
        entityType: "User",
        entityId: user.id,
        action: "LOGIN_FAILED_NO_ACTIVE_STAFF_MEMBERSHIP",
        actorUserId: user.id,
      });
      throw AppError.unauthorized(
        "NO_ACTIVE_STAFF_MEMBERSHIP",
        "This account has no active staff membership at any garage",
      );
    }

    const ctx: StaffContext = {
      userId: user.id,
      organizationId: staffMember.organizationId,
      garageId: staffMember.garageId,
      staffMemberId: staffMember.id,
      role: staffMember.role,
    };

    const tokens = await this.tokens.issueTokenPair(ctx);

    await this.audit.record({
      organizationId: ctx.organizationId,
      entityType: "User",
      entityId: user.id,
      action: "LOGIN",
      actorUserId: user.id,
    });

    return { tokens, ctx };
  }

  async refresh(refreshToken: string) {
    return this.tokens.rotateRefreshToken(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeFamily(refreshToken);
  }

  async me(userId: string, organizationId: string) {
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, fullName: true, createdAt: true },
    });
    const staffMember = await this.prisma.client.staffMember.findFirst({
      where: { userId, organizationId, active: true },
      include: { garage: true },
    });
    return { user, staffMember };
  }
}
