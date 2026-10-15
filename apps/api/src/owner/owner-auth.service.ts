import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import type { OwnerRegisterInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { TokenService, type TokenPair } from "../auth/token.service";

@Injectable()
export class OwnerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Any User — staff or not — can register/log into the owner app with
   * the same identifier (docs/DECISIONS.md ADR-0020: token kind is a
   * session property, not a user property). Registration only fails if
   * that identifier is *already* an account — the fix there is "log in,"
   * not "register a second account."
   */
  async register(input: OwnerRegisterInput): Promise<{ tokens: TokenPair; userId: string }> {
    const existing = await this.prisma.unscopedClient.user.findFirst({
      where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
    });
    if (existing) {
      throw AppError.conflict(
        "ACCOUNT_ALREADY_EXISTS",
        "An account with this phone or email already exists — log in instead",
      );
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.unscopedClient.user.create({
      data: { fullName: input.fullName, phone: input.phone, email: input.email, passwordHash },
    });

    const tokens = await this.tokens.issueOwnerTokenPair({ userId: user.id });

    await this.audit.record({
      organizationId: null,
      entityType: "User",
      entityId: user.id,
      action: "OWNER_REGISTERED",
      actorUserId: user.id,
    });

    return { tokens, userId: user.id };
  }

  async login(identifier: string, password: string): Promise<{ tokens: TokenPair; userId: string }> {
    const user = await this.prisma.unscopedClient.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user) {
      await this.audit.record({
        organizationId: null,
        entityType: "LoginAttempt",
        entityId: identifier,
        action: "OWNER_LOGIN_FAILED_UNKNOWN_IDENTIFIER",
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/phone or password");
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.audit.record({
        organizationId: null,
        entityType: "User",
        entityId: user.id,
        action: "OWNER_LOGIN_FAILED_WRONG_PASSWORD",
        actorUserId: user.id,
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/phone or password");
    }

    const tokens = await this.tokens.issueOwnerTokenPair({ userId: user.id });

    await this.audit.record({
      organizationId: null,
      entityType: "User",
      entityId: user.id,
      action: "OWNER_LOGIN",
      actorUserId: user.id,
    });

    return { tokens, userId: user.id };
  }

  async refresh(refreshToken: string) {
    return this.tokens.rotateOwnerRefreshToken(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeFamily(refreshToken);
  }

  async me(userId: string) {
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, fullName: true, createdAt: true },
    });
    if (!user) {
      throw AppError.notFound("USER_NOT_FOUND", "User not found");
    }
    return user;
  }
}
