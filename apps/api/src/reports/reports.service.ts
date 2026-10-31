import { Injectable } from "@nestjs/common";
import { InvoiceStatus, JobStatus, VehicleStatus } from "@le-garage/database";
import type { ReportRangeInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { averageHours, HOUR_MS, repairDowntimeMs } from "./report-math";

const OPEN_JOB_FILTER = { notIn: [JobStatus.COLLECTED, JobStatus.CLOSED, JobStatus.CANCELLED] };

/** Safety bound on rows aggregated in memory per report; `truncated` tells the client if it was hit. */
const MAX_ROWS = 5000;

/**
 * Fleet maintenance reporting (docs/FLEET.md). Every figure is computed
 * from recorded data — ISSUED invoices (VOID ones excluded), payments, and
 * job status timestamps. Nothing is estimated, projected, or filled in: a
 * vehicle with no repairs shows real zeros, and an average with no data
 * points is null, not 0. Amounts are in santim (1/100 ETB), like every
 * other money field in the API.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** "What needs my attention right now" for a fleet owner or supervisor. */
  async fleetSummary(organizationId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [vehicleCounts, openRepairs, awaitingApproval, outOfService, monthInvoices, issuedTotal, paidTotal] =
      await Promise.all([
        this.prisma.client.vehicle.groupBy({
          by: ["status"],
          where: { organizationId, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.client.job.count({ where: { organizationId, deletedAt: null, status: OPEN_JOB_FILTER } }),
        this.prisma.client.job.findMany({
          where: { organizationId, deletedAt: null, status: JobStatus.WAITING_APPROVAL },
          include: {
            vehicle: true,
            serviceProvider: { select: { id: true, name: true } },
            estimates: { where: { status: "SENT" }, orderBy: { version: "desc" }, take: 1 },
          },
          orderBy: { waitingApprovalAt: "asc" },
          take: 20,
        }),
        this.prisma.client.vehicle.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: [VehicleStatus.IN_MAINTENANCE, VehicleStatus.UNAVAILABLE] },
          },
          include: {
            jobs: {
              where: { organizationId, deletedAt: null, status: OPEN_JOB_FILTER },
              select: { id: true, status: true, complaint: true, intakeAt: true },
              orderBy: { intakeAt: "asc" },
              take: 1,
            },
          },
          take: 100,
        }),
        this.prisma.client.invoice.aggregate({
          where: { organizationId, status: InvoiceStatus.ISSUED, issuedAt: { gte: startOfMonth } },
          _sum: { total: true },
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

    return {
      vehiclesByStatus: Object.fromEntries(vehicleCounts.map((v) => [v.status, v._count._all])),
      openRepairs,
      awaitingApproval: awaitingApproval.map((job) => ({
        jobId: job.id,
        complaint: job.complaint,
        waitingSince: job.waitingApprovalAt,
        vehicle: { id: job.vehicle.id, licensePlate: job.vehicle.licensePlate, make: job.vehicle.make, model: job.vehicle.model },
        serviceProvider: job.serviceProvider,
        estimateTotal: job.estimates[0]?.total ?? null,
      })),
      outOfService: outOfService
        .map((v) => ({
          vehicle: { id: v.id, licensePlate: v.licensePlate, make: v.make, model: v.model, status: v.status },
          openRepair: v.jobs[0] ?? null,
        }))
        .sort((a, b) => (a.openRepair?.intakeAt.getTime() ?? Infinity) - (b.openRepair?.intakeAt.getTime() ?? Infinity)),
      spendThisMonth: monthInvoices._sum.total ?? 0,
      outstandingBalance: (issuedTotal._sum.total ?? 0) - (paidTotal._sum.amount ?? 0),
    };
  }

  /**
   * Spend, downtime and turnaround for [from, to). Spend is attributed by
   * invoice issue date; downtime is the part of each repair (intake →
   * returned to service, or → now if still open) that falls in the range.
   */
  async spend(organizationId: string, range: ReportRangeInput) {
    const { from, to } = range;
    const now = new Date();

    const [invoices, vehicles, jobs, completed] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.ISSUED, issuedAt: { gte: from, lt: to } },
        include: {
          items: { select: { type: true, lineTotal: true } },
          payments: { where: { voidedAt: null }, select: { amount: true } },
          job: { select: { vehicleId: true, serviceProvider: { select: { id: true, name: true } } } },
        },
        take: MAX_ROWS,
      }),
      this.prisma.client.vehicle.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, licensePlate: true, make: true, model: true, vehicleType: true, status: true },
        orderBy: { licensePlate: "asc" },
        take: 500,
      }),
      this.prisma.client.job.findMany({
        where: {
          organizationId,
          deletedAt: null,
          intakeAt: { lt: to },
          AND: [
            { OR: [{ collectedAt: null }, { collectedAt: { gte: from } }] },
            { OR: [{ cancelledAt: null }, { cancelledAt: { gte: from } }] },
          ],
        },
        select: { id: true, vehicleId: true, intakeAt: true, collectedAt: true, cancelledAt: true },
        take: MAX_ROWS,
      }),
      this.prisma.client.job.findMany({
        where: { organizationId, deletedAt: null, readyAt: { gte: from, lt: to } },
        select: { intakeAt: true, readyAt: true },
        take: MAX_ROWS,
      }),
    ]);

    type Row = {
      vehicleId: string;
      repairsOpened: number;
      invoicedTotal: number;
      paidTotal: number;
      partsTotal: number;
      laborTotal: number;
      downtimeMs: number;
    };
    const rows = new Map<string, Row>(
      vehicles.map((v) => [
        v.id,
        { vehicleId: v.id, repairsOpened: 0, invoicedTotal: 0, paidTotal: 0, partsTotal: 0, laborTotal: 0, downtimeMs: 0 },
      ]),
    );

    const totals = { invoiced: 0, paid: 0, parts: 0, labor: 0, uncategorized: 0, tax: 0, discount: 0 };
    const byProvider = new Map<string, { serviceProviderId: string | null; name: string; invoicedTotal: number; invoices: number }>();

    for (const invoice of invoices) {
      const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
      totals.invoiced += invoice.total;
      totals.paid += paid;
      totals.tax += invoice.taxTotal;
      totals.discount += invoice.discountTotal;

      let parts = 0;
      let labor = 0;
      for (const item of invoice.items) {
        if (item.type === "PART") parts += item.lineTotal;
        else if (item.type === "LABOR") labor += item.lineTotal;
        else totals.uncategorized += item.lineTotal;
      }
      totals.parts += parts;
      totals.labor += labor;

      const row = rows.get(invoice.job.vehicleId);
      if (row) {
        row.invoicedTotal += invoice.total;
        row.paidTotal += paid;
        row.partsTotal += parts;
        row.laborTotal += labor;
      }

      const provider = invoice.job.serviceProvider;
      const key = provider?.id ?? "none";
      const entry = byProvider.get(key) ?? {
        serviceProviderId: provider?.id ?? null,
        name: provider?.name ?? "No provider recorded",
        invoicedTotal: 0,
        invoices: 0,
      };
      entry.invoicedTotal += invoice.total;
      entry.invoices += 1;
      byProvider.set(key, entry);
    }

    for (const job of jobs) {
      const row = rows.get(job.vehicleId);
      if (!row) continue;
      row.downtimeMs += repairDowntimeMs(job, from, to, now);
      if (job.intakeAt >= from) row.repairsOpened += 1;
    }

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const perVehicle = [...rows.values()]
      .map(({ downtimeMs, ...r }) => ({
        ...r,
        vehicle: vehicleById.get(r.vehicleId)!,
        downtimeHours: Math.round((downtimeMs / HOUR_MS) * 10) / 10,
      }))
      .sort((a, b) => b.invoicedTotal - a.invoicedTotal || b.downtimeHours - a.downtimeHours);

    return {
      from,
      to,
      currency: "ETB",
      totals: {
        invoicedTotal: totals.invoiced,
        paidTotal: totals.paid,
        outstandingTotal: totals.invoiced - totals.paid,
        byCategory: {
          parts: totals.parts,
          labor: totals.labor,
          uncategorized: totals.uncategorized,
          tax: totals.tax,
          discount: totals.discount,
        },
        invoiceCount: invoices.length,
        completedRepairs: completed.length,
        averageTurnaroundHours: averageHours(completed.map((j) => j.readyAt!.getTime() - j.intakeAt.getTime())),
      },
      byProvider: [...byProvider.values()].sort((a, b) => b.invoicedTotal - a.invoicedTotal),
      perVehicle,
      truncated: invoices.length === MAX_ROWS || jobs.length === MAX_ROWS || completed.length === MAX_ROWS,
    };
  }
}
