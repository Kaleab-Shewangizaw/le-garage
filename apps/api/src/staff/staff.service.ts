import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { Role } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

export interface InviteStaffInput {
  fullName: string;
  email?: string;
  phone?: string;
  role: Role;
  temporaryPassword: string;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, garageId: string) {
    return this.prisma.client.staffMember.findMany({
      where: { organizationId, garageId },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async invite(organizationId: string, garageId: string, actorUserId: string, input: InviteStaffInput) {
    if (!input.email && !input.phone) {
      throw AppError.badRequest("MISSING_CONTACT", "Either email or phone is required");
    }

    // Identity creation/lookup necessarily precedes tenant-scoped
    // StaffMember creation — see prismaUnscoped doc comment.
    let user = input.email
      ? await this.prisma.unscopedClient.user.findUnique({ where: { email: input.email } })
      : await this.prisma.unscopedClient.user.findUnique({ where: { phone: input.phone } });

    if (!user) {
      const passwordHash = await argon2.hash(input.temporaryPassword);
      user = await this.prisma.unscopedClient.user.create({
        data: { fullName: input.fullName, email: input.email, phone: input.phone, passwordHash },
      });
    }

    const existingMembership = await this.prisma.client.staffMember.findFirst({
      where: { organizationId, garageId, userId: user.id },
    });
    if (existingMembership) {
      throw AppError.conflict("ALREADY_STAFF", "This person is already staff at this garage");
    }

    const staffMember = await this.prisma.client.staffMember.create({
      data: { organizationId, garageId, userId: user.id, role: input.role },
    });

    await this.audit.record({
      organizationId,
      entityType: "StaffMember",
      entityId: staffMember.id,
      action: "STAFF_INVITED",
      actorUserId,
      afterState: staffMember,
    });

    return staffMember;
  }

  async updateRole(
    organizationId: string,
    garageId: string,
    staffMemberId: string,
    actorUserId: string,
    input: { role?: Role; active?: boolean },
  ) {
    const before = await this.prisma.client.staffMember.findFirst({
      where: { id: staffMemberId, organizationId, garageId },
    });
    if (!before) {
      throw AppError.notFound("STAFF_MEMBER_NOT_FOUND", "Staff member not found");
    }

    const updated = await this.prisma.client.staffMember.update({
      where: { id: staffMemberId, organizationId },
      data: input,
    });

    await this.audit.record({
      organizationId,
      entityType: "StaffMember",
      entityId: staffMemberId,
      action: "STAFF_ROLE_CHANGED",
      actorUserId,
      beforeState: before,
      afterState: updated,
    });

    return updated;
  }
}
