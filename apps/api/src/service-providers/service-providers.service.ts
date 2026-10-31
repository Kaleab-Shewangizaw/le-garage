import { Injectable } from "@nestjs/common";
import { OrganizationKind } from "@le-garage/database";
import type { CreateServiceProviderInput, UpdateServiceProviderInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

/**
 * A fleet organization's private directory of the garages it uses
 * (docs/FLEET.md). Tenant-scoped like Customer — one company's provider
 * list (and what it spends with each) is never visible to another.
 */
@Injectable()
export class ServiceProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, includeInactive: boolean) {
    return this.prisma.client.serviceProvider.findMany({
      where: { organizationId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: "asc" },
      take: 200,
    });
  }

  async getById(organizationId: string, id: string) {
    const provider = await this.prisma.client.serviceProvider.findFirst({ where: { id, organizationId } });
    if (!provider) {
      throw AppError.notFound("SERVICE_PROVIDER_NOT_FOUND", "Service provider not found");
    }
    const jobs = await this.prisma.client.job.findMany({
      where: { organizationId, serviceProviderId: id, deletedAt: null },
      include: { vehicle: true },
      orderBy: { intakeAt: "desc" },
      take: 50,
    });
    return { ...provider, jobs };
  }

  /**
   * Garages on Le Garage a fleet can connect to (docs/WORK-ORDERS.md). Only
   * a garage's public business details cross the tenant boundary here —
   * name, city, phone, address — never its customers or jobs.
   */
  async directory(organizationId: string, search?: string) {
    const garages = await this.prisma.unscopedClient.organization.findMany({
      where: {
        kind: OrganizationKind.GARAGE,
        suspendedAt: null,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      select: { id: true, name: true, garage: { select: { city: true, phone: true, address: true } } },
      orderBy: { name: "asc" },
      take: 50,
    });
    const connected = await this.prisma.client.serviceProvider.findMany({
      where: { organizationId, garageOrganizationId: { in: garages.map((g) => g.id) } },
      select: { id: true, garageOrganizationId: true },
    });
    const byGarage = new Map(connected.map((c) => [c.garageOrganizationId, c.id]));
    return garages.map((g) => ({
      organizationId: g.id,
      name: g.name,
      city: g.garage?.city ?? null,
      phone: g.garage?.phone ?? null,
      address: g.garage?.address ?? null,
      serviceProviderId: byGarage.get(g.id) ?? null,
    }));
  }

  async create(organizationId: string, actorUserId: string, input: CreateServiceProviderInput) {
    if (input.garageOrganizationId) {
      const garage = await this.prisma.unscopedClient.organization.findUnique({ where: { id: input.garageOrganizationId } });
      if (!garage || garage.kind !== OrganizationKind.GARAGE || garage.suspendedAt) {
        throw AppError.notFound("GARAGE_NOT_FOUND", "That garage isn't on Le Garage");
      }
      const existing = await this.prisma.client.serviceProvider.findFirst({
        where: { organizationId, garageOrganizationId: input.garageOrganizationId },
      });
      if (existing) {
        throw AppError.conflict("PROVIDER_EXISTS", "This garage is already in your providers", { serviceProviderId: existing.id });
      }
    }
    const provider = await this.prisma.client.serviceProvider.create({ data: { organizationId, ...input } });
    await this.audit.record({
      organizationId,
      entityType: "ServiceProvider",
      entityId: provider.id,
      action: "SERVICE_PROVIDER_CREATED",
      actorUserId,
      afterState: provider,
    });
    return provider;
  }

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateServiceProviderInput) {
    const before = await this.prisma.client.serviceProvider.findFirst({ where: { id, organizationId } });
    if (!before) {
      throw AppError.notFound("SERVICE_PROVIDER_NOT_FOUND", "Service provider not found");
    }
    const updated = await this.prisma.client.serviceProvider.update({ where: { id, organizationId }, data: input });
    await this.audit.record({
      organizationId,
      entityType: "ServiceProvider",
      entityId: id,
      action: "SERVICE_PROVIDER_UPDATED",
      actorUserId,
      beforeState: before,
      afterState: updated,
    });
    return updated;
  }
}
