import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import type { AccessTokenPayload } from "@le-garage/types";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

export interface StaffContext {
  userId: string;
  organizationId: string;
  garageId: string;
  staffMemberId: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Issues and verifies access/refresh tokens (docs/AUTH.md §5). Refresh
 * tokens are stored hashed and rotated on every use, with reuse detection:
 * presenting an already-rotated (or revoked) token revokes the whole
 * token family, since that's the signal a refresh token was stolen.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issueTokenPair(ctx: StaffContext, familyId: string = randomUUID()): Promise<TokenPair> {
    const payload: Omit<AccessTokenPayload, "iat" | "exp"> = {
      sub: ctx.userId,
      organizationId: ctx.organizationId,
      garageId: ctx.garageId,
      staffMemberId: ctx.staffMemberId,
      role: ctx.role,
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
    });

    const rawRefreshToken = randomUUID() + randomUUID();
    const tokenHash = this.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.parseTtlMs(process.env.JWT_REFRESH_TTL ?? "30d"));

    await this.prisma.client.refreshToken.create({
      data: {
        userId: ctx.userId,
        tokenHash,
        familyId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: `${familyId}.${rawRefreshToken}` };
  }

  async rotateRefreshToken(presented: string): Promise<{ ctx: StaffContext; tokens: TokenPair }> {
    const [familyId, rawToken] = presented.split(".");
    if (!familyId || !rawToken) {
      throw AppError.unauthorized("INVALID_REFRESH_TOKEN", "Malformed refresh token");
    }

    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.client.refreshToken.findFirst({
      where: { tokenHash, familyId },
    });

    if (!stored) {
      throw AppError.unauthorized("INVALID_REFRESH_TOKEN", "Unknown refresh token");
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      // Reuse of a revoked/expired token in this family: treat as
      // compromised and revoke the entire family (docs/AUTH.md §5). This
      // is one of the highest-signal security events in the system — a
      // legitimate client never presents an already-rotated token, so
      // this either means a stolen token or a client bug; either way it's
      // audited (docs/SECURITY.md §5).
      await this.prisma.client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        organizationId: null,
        entityType: "User",
        entityId: stored.userId,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        actorUserId: stored.userId,
        afterState: { familyId, wasAlreadyRevoked: !!stored.revokedAt, wasExpired: stored.expiresAt < new Date() },
      });
      throw AppError.unauthorized(
        "REFRESH_TOKEN_REUSE_DETECTED",
        "This refresh token has already been used or has expired; all sessions in this family were revoked",
      );
    }

    // Bootstrapping which tenant this refresh token's user belongs to —
    // legitimately unscoped, see @le-garage/database's prismaUnscoped doc comment.
    const staffMember = await this.prisma.unscopedClient.staffMember.findFirst({
      where: { userId: stored.userId, active: true },
    });
    if (!staffMember) {
      throw AppError.unauthorized("NO_ACTIVE_STAFF_MEMBERSHIP", "No active staff membership for this user");
    }

    await this.prisma.client.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const ctx: StaffContext = {
      userId: staffMember.userId,
      organizationId: staffMember.organizationId,
      garageId: staffMember.garageId,
      staffMemberId: staffMember.id,
      role: staffMember.role,
    };

    const tokens = await this.issueTokenPair(ctx, familyId);
    return { ctx, tokens };
  }

  async revokeFamily(presented: string): Promise<void> {
    const [familyId] = presented.split(".");
    if (!familyId) return;
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
    return value * unitMs;
  }
}
