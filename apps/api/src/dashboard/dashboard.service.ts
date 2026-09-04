import { Injectable } from "@nestjs/common";
import { JobStatus } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "What is happening in my garage right now" (docs/PRODUCT.md §8,
   * docs/MVP.md) — operational counts, not vanity analytics.
   */
  async summary(organizationId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [statusCounts, jobsIntakenToday, jobsCollectedToday, awaitingApproval, blockedOnParts] = await Promise.all([
      this.prisma.client.job.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.client.job.count({
        where: { organizationId, deletedAt: null, intakeAt: { gte: startOfDay } },
      }),
      this.prisma.client.job.count({
        where: { organizationId, deletedAt: null, collectedAt: { gte: startOfDay } },
      }),
      this.prisma.client.job.count({
        where: { organizationId, deletedAt: null, status: JobStatus.WAITING_APPROVAL },
      }),
      this.prisma.client.job.count({
        where: { organizationId, deletedAt: null, status: JobStatus.WAITING_PARTS },
      }),
    ]);

    const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

    return {
      countsByStatus,
      vehiclesCurrentlyInGarage: statusCounts
        .filter((s) => s.status !== JobStatus.COLLECTED && s.status !== JobStatus.CLOSED && s.status !== JobStatus.CANCELLED)
        .reduce((sum, s) => sum + s._count._all, 0),
      jobsIntakenToday,
      jobsCollectedToday,
      jobsAwaitingApproval: awaitingApproval,
      jobsBlockedOnParts: blockedOnParts,
    };
  }
}
