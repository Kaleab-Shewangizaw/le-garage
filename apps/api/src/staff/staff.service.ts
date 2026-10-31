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

  async invite(organizationId: string, garageId: string, actorUserId: string, actorRole: Role, input: InviteStaffInput) {
    if (!input.email && !input.phone) {
      throw AppError.badRequest("MISSING_CONTACT", "Either email or phone is required");
    }
    // Owners are the account holders (docs/FLEET.md §5): only an owner can
    // make someone else an owner. A manager/supervisor runs the team below that.
    if (input.role === Role.OWNER && actorRole !== Role.OWNER) {
      throw AppError.forbidden("OWNER_ONLY", "Only an owner can add another owner");
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
    // An existing login that already works for *another* organization must
    // not be silently pulled into this one: sign-in can only land a person
    // in one organization today, so this would quietly move them out of
    // their real employer's account. (Identity lookup is unscoped by
    // necessity — see prismaUnscoped.)
    const elsewhere = await this.prisma.unscopedClient.staffMember.findFirst({
      where: { userId: user.id, organizationId: { not: organizationId } },
    });
    if (elsewhere) {
      throw AppError.conflict("ACCOUNT_IN_USE", "That email or phone already belongs to someone at another organization");
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
    actor: { userId: string; staffMemberId: string; role: Role },
    input: { role?: Role; active?: boolean },
  ) {
    const actorUserId = actor.userId;
    const before = await this.prisma.client.staffMember.findFirst({
      where: { id: staffMemberId, organizationId, garageId },
    });
    if (!before) {
      throw AppError.notFound("STAFF_MEMBER_NOT_FOUND", "Staff member not found");
    }

    if (actor.role !== Role.OWNER && (before.role === Role.OWNER || input.role === Role.OWNER)) {
      throw AppError.forbidden("OWNER_ONLY", "Only an owner can change an owner, or make someone an owner");
    }
    if (staffMemberId === actor.staffMemberId && (input.active === false || (input.role && input.role !== before.role))) {
      throw AppError.forbidden("CANNOT_CHANGE_SELF", "You can't change your own role or deactivate yourself — ask another owner");
    }
    const losingOwner = before.role === Role.OWNER && before.active && (input.active === false || (input.role && input.role !== Role.OWNER));
    if (losingOwner) {
      const owners = await this.prisma.client.staffMember.count({
        where: { organizationId, garageId, role: Role.OWNER, active: true },
      });
      if (owners <= 1) {
        throw AppError.conflict("LAST_OWNER", "Every organization needs at least one active owner");
      }
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
