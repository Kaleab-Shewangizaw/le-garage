import { Injectable } from "@nestjs/common";
import { InvoiceStatus, JobStatus } from "@le-garage/database";
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

    const [statusCounts, jobsIntakenToday, jobsCollectedToday, awaitingApproval, blockedOnParts, issuedTotal, paidTotal] = await Promise.all([
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
      this.prisma.client.invoice.aggregate({
        where: { organizationId, status: InvoiceStatus.ISSUED },
        _sum: { total: true },
      }),
      this.prisma.client.payment.aggregate({
        where: { organizationId, voidedAt: null, invoice: { status: InvoiceStatus.ISSUED } },
        _sum: { amount: true },
      }),
    ]);

    const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
    const outstandingBalance = (issuedTotal._sum.total ?? 0) - (paidTotal._sum.amount ?? 0);

    return {
      countsByStatus,
      vehiclesCurrentlyInGarage: statusCounts
        .filter((s) => s.status !== JobStatus.COLLECTED && s.status !== JobStatus.CLOSED && s.status !== JobStatus.CANCELLED)
        .reduce((sum, s) => sum + s._count._all, 0),
      jobsIntakenToday,
      jobsCollectedToday,
      jobsAwaitingApproval: awaitingApproval,
      jobsBlockedOnParts: blockedOnParts,
      outstandingBalance,
    };
  }
}
