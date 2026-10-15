import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

/**
 * The single chokepoint every owner-facing service goes through before
 * returning anything (docs/SECURITY.md §"Owner isolation", brief:
 * "Can an owner access another owner's vehicle? The answer must always be
 * no."). An owner session has no organizationId to be scoped by — the
 * Prisma tenant-scope extension can't help here — so ownership is instead
 * verified explicitly, every time, against this owner's *confirmed*
 * CustomerLink rows. All lookups here deliberately use `unscopedClient`:
 * an owner's data legitimately spans multiple organizations, and that's
 * the one legitimate reason to bypass the tenant-scope guard (see
 * @le-garage/database's prismaUnscoped doc comment) — never as a
 * shortcut in a staff-facing (single-tenant) service.
 *
 * Every method throws 404, not 403, on a mismatch — same convention as
 * the staff-side tenant-isolation tests (docs/SECURITY.md), so a probing
 * request can't distinguish "doesn't exist" from "exists but isn't yours."
 */
@Injectable()
export class OwnerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async linkedCustomerIds(ownerId: string): Promise<string[]> {
    const links = await this.prisma.unscopedClient.customerLink.findMany({
      where: { userId: ownerId },
      select: { customerId: true },
    });
    return links.map((l) => l.customerId);
  }

  /** Throws unless `vehicleId` currently belongs (VehicleOwnerHistory, endedAt null) to one of this owner's linked customers. */
  async assertVehicleAccess(ownerId: string, vehicleId: string) {
    const customerIds = await this.linkedCustomerIds(ownerId);
    const link =
      customerIds.length > 0
        ? await this.prisma.unscopedClient.vehicleOwnerHistory.findFirst({
            where: { vehicleId, customerId: { in: customerIds }, endedAt: null },
          })
        : null;
    if (!link) {
      throw AppError.notFound("VEHICLE_NOT_FOUND", "Vehicle not found");
    }
    return link.vehicleId;
  }

  /** Throws unless `jobId`'s customer is one of this owner's linked customers. Returns the job row. */
  async assertJobAccess(ownerId: string, jobId: string) {
    const customerIds = await this.linkedCustomerIds(ownerId);
    const job =
      customerIds.length > 0
        ? await this.prisma.unscopedClient.job.findFirst({
            where: { id: jobId, customerId: { in: customerIds }, deletedAt: null },
          })
        : null;
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }

  /** Throws unless `estimateId`'s job belongs to one of this owner's linked customers. Returns estimate + job. */
  async assertEstimateAccess(ownerId: string, estimateId: string) {
    const customerIds = await this.linkedCustomerIds(ownerId);
    const estimate =
      customerIds.length > 0
        ? await this.prisma.unscopedClient.estimate.findFirst({
            where: { id: estimateId, job: { customerId: { in: customerIds }, deletedAt: null } },
            include: { job: true },
          })
        : null;
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "Estimate not found");
    }
    return estimate;
  }
}
