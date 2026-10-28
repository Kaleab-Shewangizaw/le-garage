import { Injectable } from "@nestjs/common";
import { JobStatus } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { OwnerAccessService } from "./owner-access.service";

const TERMINAL_STATUSES: JobStatus[] = [JobStatus.COLLECTED, JobStatus.CANCELLED, JobStatus.CLOSED];

@Injectable()
export class OwnerVehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OwnerAccessService,
  ) {}

  async list(ownerId: string) {
    const customerIds = await this.access.linkedCustomerIds(ownerId);
    if (customerIds.length === 0) return [];

    const ownerships = await this.prisma.unscopedClient.vehicleOwnerHistory.findMany({
      where: { customerId: { in: customerIds }, endedAt: null },
      include: {
        vehicle: {
          include: {
            jobs: {
              where: { deletedAt: null, status: { notIn: TERMINAL_STATUSES } },
              orderBy: { intakeAt: "desc" },
              take: 1,
              include: { organization: { include: { garage: true } } },
            },
          },
        },
      },
    });

    return ownerships.map(({ vehicle }) => {
      const activeJob = vehicle.jobs[0];
      return {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        licensePlate: vehicle.licensePlate,
        lastKnownMileage: vehicle.lastKnownMileage,
        activeJob: activeJob
          ? { id: activeJob.id, status: activeJob.status, garageName: activeJob.organization.garage?.name ?? null }
          : null,
      };
    });
  }

  async getById(ownerId: string, vehicleId: string) {
    await this.access.assertVehicleAccess(ownerId, vehicleId);

    const vehicle = await this.prisma.unscopedClient.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: {
        jobs: {
          where: { deletedAt: null },
          orderBy: { intakeAt: "desc" },
          include: { organization: { include: { garage: true } } },
        },
        serviceRecords: {
          orderBy: { serviceDate: "desc" },
          include: { job: { include: { organization: { include: { garage: true } } } } },
        },
        ownerHistory: {
          where: { endedAt: null },
          include: { customer: true },
          take: 1,
        },
      },
    });

    const activeJob = vehicle.jobs.find((j) => !TERMINAL_STATUSES.includes(j.status));
    const currentOwnerCustomer = vehicle.ownerHistory[0]?.customer;

    return {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      lastKnownMileage: vehicle.lastKnownMileage,
      owner: currentOwnerCustomer ? { fullName: currentOwnerCustomer.fullName, phone: currentOwnerCustomer.phone } : null,
      activeJob: activeJob
        ? { id: activeJob.id, status: activeJob.status, garageName: activeJob.organization.garage?.name ?? null }
        : null,
      serviceHistory: vehicle.serviceRecords.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        serviceDate: r.serviceDate,
        mileage: r.mileage,
        garageName: r.job.organization.garage?.name ?? null,
        summary: r.summary,
      })),
    };
  }
}
