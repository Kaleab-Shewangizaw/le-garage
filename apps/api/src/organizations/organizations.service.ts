import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { Role } from "@le-garage/database";
import type { RegisterOrganizationInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { TokenService } from "../auth/token.service";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Signup: creates the Organization + Garage + owner User + OWNER
   * StaffMember in one transaction, then logs the owner in. For a FLEET
   * organization the Garage row is the company's workspace record (every
   * StaffMember and Job hangs off one — docs/FLEET.md), named after the
   * company itself.
   * This is the only place a User/StaffMember is created without an
   * existing tenant context, by definition.
   */
  async register(input: RegisterOrganizationInput) {
    if (input.ownerEmail) {
      const existing = await this.prisma.unscopedClient.user.findUnique({ where: { email: input.ownerEmail } });
      if (existing) {
        throw AppError.conflict("EMAIL_TAKEN", "An account with this email already exists");
      }
    }

    const passwordHash = await argon2.hash(input.password);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, kind: input.kind },
      });
      const garage = await tx.garage.create({
        data: {
          organizationId: organization.id,
          name: input.garageName ?? input.organizationName,
          phone: input.garagePhone,
          address: input.garageAddress,
        },
      });
      const user = await tx.user.create({
        data: {
          fullName: input.ownerFullName,
          email: input.ownerEmail,
          phone: input.ownerPhone,
          passwordHash,
        },
      });
      const staffMember = await tx.staffMember.create({
        data: {
          organizationId: organization.id,
          garageId: garage.id,
          userId: user.id,
          role: Role.OWNER,
        },
      });
      return { organization, garage, user, staffMember };
    });

    await this.audit.record({
      organizationId: result.organization.id,
      entityType: "Organization",
      entityId: result.organization.id,
      action: "ORGANIZATION_REGISTERED",
      actorUserId: result.user.id,
    });

    const ctx = {
      userId: result.user.id,
      organizationId: result.organization.id,
      garageId: result.garage.id,
      staffMemberId: result.staffMember.id,
      role: result.staffMember.role,
    };
    const tokens = await this.tokens.issueTokenPair(ctx);

    return { tokens, ctx, organization: result.organization, garage: result.garage };
  }
}
