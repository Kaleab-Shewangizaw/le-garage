import { Injectable } from "@nestjs/common";
import type { CreateVehicleInput, UpdateVehicleInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Search by plate/VIN — the fast intake lookup (docs/UX.md, DOMAIN.md §4). */
  async search(organizationId: string, search?: string) {
    return this.prisma.client.vehicle.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { licensePlate: { contains: search, mode: "insensitive" as const } },
                { vin: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
  }

  async getById(organizationId: string, id: string) {
    const vehicle = await this.prisma.client.vehicle.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!vehicle) {
      throw AppError.notFound("VEHICLE_NOT_FOUND", "Vehicle not found");
    }
    return vehicle;
  }

  async create(organizationId: string, actorUserId: string, input: CreateVehicleInput) {
    if (input.vin) {
      const existingByVin = await this.prisma.client.vehicle.findFirst({
        where: { organizationId, vin: input.vin, deletedAt: null },
      });
      if (existingByVin) {
        throw AppError.conflict(
          "VEHICLE_VIN_EXISTS",
          "A vehicle with this VIN already exists — use it instead of creating a duplicate",
          { vehicleId: existingByVin.id },
        );
      }
    }

    const { ownerCustomerId, ...vehicleData } = input;

    const vehicle = await this.prisma.client.vehicle.create({
      data: { organizationId, ...vehicleData },
    });

    if (ownerCustomerId) {
      await this.prisma.client.vehicleOwnerHistory.create({
        data: { vehicleId: vehicle.id, customerId: ownerCustomerId },
      });
    }

    await this.audit.record({
      organizationId,
      entityType: "Vehicle",
      entityId: vehicle.id,
      action: "VEHICLE_CREATED",
      actorUserId,
      afterState: vehicle,
    });

    return vehicle;
  }

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateVehicleInput) {
    const before = await this.getById(organizationId, id);

    const updated = await this.prisma.client.vehicle.update({
      where: { id, organizationId },
      data: input,
    });

    if (before.licensePlate !== updated.licensePlate) {
      // Plate-change history is captured only via AuditLog in MVP —
      // see docs/OPEN_QUESTIONS.md #9.
      await this.audit.record({
        organizationId,
        entityType: "Vehicle",
        entityId: id,
        action: "VEHICLE_PLATE_CHANGED",
        actorUserId,
        beforeState: { licensePlate: before.licensePlate },
        afterState: { licensePlate: updated.licensePlate },
      });
    }

    return updated;
  }

  async jobHistory(organizationId: string, vehicleId: string) {
    await this.getById(organizationId, vehicleId);
    return this.prisma.client.job.findMany({
      where: { organizationId, vehicleId },
      orderBy: { intakeAt: "desc" },
    });
  }

  /**
   * The durable, owner-facing record (docs/DOMAIN.md §3/§8, docs/MVP.md) —
   * "what happened to my car?" Built from ServiceRecord rows written when
   * a job is COLLECTED (docs/DOMAIN.md §5); never assembled ad hoc from
   * live job state, so it stays trustworthy even if a job is later
   * archived.
   */
  async serviceHistory(organizationId: string, vehicleId: string) {
    await this.getById(organizationId, vehicleId);
    return this.prisma.client.serviceRecord.findMany({
      where: { organizationId, vehicleId },
      orderBy: { serviceDate: "desc" },
    });
  }
}
