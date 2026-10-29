import { Injectable } from "@nestjs/common";
import { JobStatus, OrganizationKind, Prisma, Role } from "@le-garage/database";
import type { AdminUpdateStaffInput, SuspendOrganizationInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

const OPEN_JOB_STATUSES = { notIn: [JobStatus.COLLECTED, JobStatus.CLOSED, JobStatus.CANCELLED] };

/**
 * Le Garage's internal support/oversight console (docs/ADMIN.md, docs/AUTH.md
 * §8). This is the one deliberate cross-tenant surface in the API, so it
 * uses the unscoped Prisma client on purpose — every route is
 * PLATFORM_ADMIN-only (AdminController), and every *write* is audit-logged
 * against the organization it touched, with the admin as actor.
 *
 * Admins oversee and control access (suspend an organization, deactivate
 * a person); they do not edit a tenant's operational or financial records
 * — repairs, estimates, invoices stay the tenant's own, so their audit
 * trail is never muddied by someone outside the company.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.unscopedClient;
  }

  async overview() {
    const tenantWhere = { kind: { not: OrganizationKind.PLATFORM } };
    const [orgsByKind, suspended, users, vehicles, openJobs, recentOrgs] = await Promise.all([
      this.db.organization.groupBy({ by: ["kind"], where: tenantWhere, _count: { _all: true } }),
      this.db.organization.count({ where: { ...tenantWhere, suspendedAt: { not: null } } }),
      this.db.user.count(),
      this.db.vehicle.count({ where: { deletedAt: null } }),
      this.db.job.count({ where: { deletedAt: null, status: OPEN_JOB_STATUSES } }),
      this.db.organization.findMany({
        where: tenantWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, kind: true, createdAt: true, suspendedAt: true },
      }),
    ]);
    return {
      organizationsByKind: Object.fromEntries(orgsByKind.map((o) => [o.kind, o._count._all])),
      suspendedOrganizations: suspended,
      users,
      vehicles,
      openJobs,
      recentOrganizations: recentOrgs,
    };
  }

  async listOrganizations(search?: string, kind?: OrganizationKind) {
    const orgs = await this.db.organization.findMany({
      where: {
        kind: kind ?? { not: OrganizationKind.PLATFORM },
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        garage: { select: { phone: true, city: true } },
        _count: { select: { staff: true, vehicles: true } },
      },
    });
    const openJobCounts = await this.db.job.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgs.map((o) => o.id) }, deletedAt: null, status: OPEN_JOB_STATUSES },
      _count: { _all: true },
    });
    const openByOrg = new Map(openJobCounts.map((j) => [j.organizationId, j._count._all]));
    return orgs.map(({ _count, ...o }) => ({
      ...o,
      staffCount: _count.staff,
      vehicleCount: _count.vehicles,
      openJobs: openByOrg.get(o.id) ?? 0,
    }));
  }

  async getOrganization(id: string) {
    const org = await this.db.organization.findUnique({
      where: { id },
      include: {
        garage: true,
        staff: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, fullName: true, email: true, phone: true, createdAt: true } } },
        },
        _count: { select: { vehicles: true, customers: true, serviceProviders: true, jobs: true } },
      },
    });
    if (!org) throw AppError.notFound("ORGANIZATION_NOT_FOUND", "Organization not found");

    const [openJobs, recentActivity] = await Promise.all([
      this.db.job.count({ where: { organizationId: id, deletedAt: null, status: OPEN_JOB_STATUSES } }),
      this.db.auditLog.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actorUser: { select: { fullName: true } },
        },
      }),
    ]);
    return { ...org, openJobs, recentActivity };
  }

  async suspendOrganization(id: string, actorUserId: string, input: SuspendOrganizationInput) {
    const org = await this.requireTenant(id);
    if (org.suspendedAt) throw AppError.conflict("ALREADY_SUSPENDED", "This organization is already suspended");
    const updated = await this.db.organization.update({
      where: { id },
      data: { suspendedAt: new Date(), suspendedReason: input.reason },
    });
    await this.audit.record({
      organizationId: id,
      entityType: "Organization",
      entityId: id,
      action: "ADMIN_ORGANIZATION_SUSPENDED",
      actorUserId,
      afterState: { reason: input.reason },
    });
    return updated;
  }

  async reactivateOrganization(id: string, actorUserId: string) {
    const org = await this.requireTenant(id);
    if (!org.suspendedAt) throw AppError.conflict("NOT_SUSPENDED", "This organization isn't suspended");
    const updated = await this.db.organization.update({
      where: { id },
      data: { suspendedAt: null, suspendedReason: null },
    });
    await this.audit.record({
      organizationId: id,
      entityType: "Organization",
      entityId: id,
      action: "ADMIN_ORGANIZATION_REACTIVATED",
      actorUserId,
      beforeState: { suspendedAt: org.suspendedAt, reason: org.suspendedReason },
    });
    return updated;
  }

  /** Lock (or restore) one person's access to one organization — e.g. a lost phone or a departed employee. */
  async updateStaff(staffId: string, actorUserId: string, input: AdminUpdateStaffInput) {
    const member = await this.db.staffMember.findUnique({
      where: { id: staffId },
      include: { organization: { select: { kind: true } } },
    });
    if (!member) throw AppError.notFound("STAFF_MEMBER_NOT_FOUND", "Staff member not found");
    if (member.role === Role.PLATFORM_ADMIN || member.organization.kind === OrganizationKind.PLATFORM) {
      throw AppError.forbidden("PLATFORM_STAFF_PROTECTED", "Platform admin accounts can't be changed from the console");
    }

    const updated = await this.db.staffMember.update({ where: { id: staffId }, data: { active: input.active } });
    if (!input.active) {
      // Also end their sessions now; the auth guard already refuses the
      // inactive membership, this just stops refresh tokens lingering.
      await this.db.refreshToken.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      organizationId: member.organizationId,
      entityType: "StaffMember",
      entityId: staffId,
      action: input.active ? "ADMIN_STAFF_REACTIVATED" : "ADMIN_STAFF_DEACTIVATED",
      actorUserId,
      beforeState: { active: member.active },
      afterState: { active: input.active, reason: input.reason },
    });
    return updated;
  }

  /** Platform-wide audit trail, newest first, optionally for one organization or one action prefix. */
  async auditLog(organizationId?: string, actionPrefix?: string, limit = 100) {
    const where: Prisma.AuditLogWhereInput = {
      ...(organizationId ? { organizationId } : {}),
      ...(actionPrefix ? { action: { startsWith: actionPrefix } } : {}),
    };
    return this.db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        organization: { select: { id: true, name: true, kind: true } },
        actorUser: { select: { fullName: true, email: true } },
      },
    });
  }

  private async requireTenant(id: string) {
    const org = await this.db.organization.findUnique({ where: { id } });
    if (!org) throw AppError.notFound("ORGANIZATION_NOT_FOUND", "Organization not found");
    if (org.kind === OrganizationKind.PLATFORM) {
      throw AppError.forbidden("PLATFORM_ORG_PROTECTED", "The platform's own organization can't be suspended");
    }
    return org;
  }
}
