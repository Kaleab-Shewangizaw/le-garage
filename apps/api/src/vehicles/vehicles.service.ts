import { Injectable } from "@nestjs/common";
import { Role, VehicleStatus } from "@le-garage/database";
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

  /**
   * Search by plate/VIN — the fast intake lookup (docs/UX.md, DOMAIN.md §4)
   * — and the fleet vehicle register. `limit` defaults to the intake
   * lookup's 20 and is capped at 200: enough for a whole pilot fleet
   * (10–100 vehicles) on one screen without an unbounded query.
   */
  async search(organizationId: string, search?: string, status?: VehicleStatus, limit?: number) {
    const take = Number.isInteger(limit) && limit! > 0 ? Math.min(limit!, 200) : 20;
    return this.prisma.client.vehicle.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(status ? { status } : {}),
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
      take,
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

  async update(organizationId: string, id: string, actorUserId: string, actorRole: Role, input: UpdateVehicleInput) {
    const before = await this.getById(organizationId, id);

    // Taking a vehicle out of (or back into) service is an operational
    // decision, not a workshop one (docs/FLEET.md).
    if (input.status && input.status !== before.status && actorRole === Role.TECHNICIAN) {
      throw AppError.forbidden("FORBIDDEN_ROLE", "Only managers and coordinators can change a vehicle's status");
    }
    if (input.vin && input.vin !== before.vin) {
      const clash = await this.prisma.client.vehicle.findFirst({
        where: { organizationId, vin: input.vin, deletedAt: null, id: { not: id } },
      });
      if (clash) {
        throw AppError.conflict("VEHICLE_VIN_EXISTS", "Another vehicle in your register already has this VIN", { vehicleId: clash.id });
      }
    }

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

    if (before.status !== updated.status) {
      await this.audit.record({
        organizationId,
        entityType: "Vehicle",
        entityId: id,
        action: "VEHICLE_STATUS_CHANGED",
        actorUserId,
        beforeState: { status: before.status },
        afterState: { status: updated.status, reason: "manual" },
      });
    }

    return updated;
  }

  async jobHistory(organizationId: string, vehicleId: string) {
    await this.getById(organizationId, vehicleId);
    return this.prisma.client.job.findMany({
      where: { organizationId, vehicleId },
      include: { serviceProvider: { select: { id: true, name: true } } },
      orderBy: { intakeAt: "desc" },
      take: 100,
    });
  }

  /**
   * The vehicle profile's visit history (docs/FLEET.md §"Vehicle profile"):
   * every time it went in for service — what was wrong, who did it, what it
   * cost, how long it was off the road — with that visit's photo evidence.
   * One query for the whole page instead of a request per visit, which
   * matters on a slow connection.
   */
  async visits(organizationId: string, vehicleId: string) {
    await this.getById(organizationId, vehicleId);
    const jobs = await this.prisma.client.job.findMany({
      where: { organizationId, vehicleId, deletedAt: null },
      orderBy: { intakeAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        complaint: true,
        mileageAtIntake: true,
        intakeAt: true,
        readyAt: true,
        collectedAt: true,
        cancelledAt: true,
        serviceProvider: { select: { id: true, name: true } },
        diagnoses: { select: { observedProblem: true, severity: true, recommendedRepair: true }, orderBy: { createdAt: "asc" } },
        estimates: { where: { status: { not: "DRAFT" } }, select: { total: true, status: true }, orderBy: { version: "desc" }, take: 1 },
        invoices: {
          where: { status: "ISSUED" },
          select: { total: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
          take: 1,
        },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    return jobs.map(({ invoices, estimates, ...job }) => {
      const invoice = invoices[0];
      const paid = invoice?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0;
      return {
        ...job,
        estimateTotal: estimates[0]?.total ?? null,
        invoiceTotal: invoice?.total ?? null,
        amountPaid: invoice ? paid : null,
      };
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
      take: 100,
    });
  }
}
