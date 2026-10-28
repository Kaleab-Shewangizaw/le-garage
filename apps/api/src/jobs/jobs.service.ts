import { Injectable } from "@nestjs/common";
import { JobStatus, Prisma, Role } from "@le-garage/database";
import type { AssignTechnicianInput, CreateJobInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { findTransition } from "./job-state-machine";

const JOB_TIMESTAMP_FIELD: Partial<Record<JobStatus, string>> = {
  DIAGNOSING: "diagnosingAt",
  WAITING_APPROVAL: "waitingApprovalAt",
  APPROVED: "approvedAt",
  IN_PROGRESS: "inProgressAt",
  QUALITY_CHECK: "qualityCheckAt",
  READY: "readyAt",
  COLLECTED: "collectedAt",
  CANCELLED: "cancelledAt",
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Dashboard/board query (docs/API.md, docs/PRODUCT.md §"Garage Dashboard"). */
  async list(organizationId: string, status?: JobStatus, search?: string, assignedTechnicianId?: string) {
    return this.prisma.client.job.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(assignedTechnicianId ? { assignedTechnicianId } : {}),
        ...(search
          ? {
              OR: [
                { vehicle: { licensePlate: { contains: search, mode: "insensitive" as const } } },
                { customer: { fullName: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        vehicle: true,
        customer: true,
        assignedTechnician: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { intakeAt: "desc" },
      take: 50,
    });
  }

  async getById(organizationId: string, id: string) {
    const job = await this.prisma.client.job.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        vehicle: true,
        customer: true,
        assignedTechnician: { include: { user: { select: { fullName: true } } } },
        diagnoses: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "asc" } },
        estimates: { orderBy: { version: "desc" }, include: { items: true } },
        approvals: { include: { itemDecisions: true } },
        parts: { orderBy: { createdAt: "asc" } },
        labor: { orderBy: { createdAt: "asc" } },
        invoices: { orderBy: { version: "desc" }, include: { items: true, payments: true } },
      },
    });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }

  async events(organizationId: string, jobId: string) {
    // getById already verifies this job belongs to the org; JobStatusEvent
    // is a pure child of Job with no organizationId column of its own
    // (docs/DATABASE.md §3), so it's queried by jobId alone from here.
    await this.getById(organizationId, jobId);
    return this.prisma.client.jobStatusEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Intake (docs/UX.md): find-or-create customer, find-or-create vehicle,
   * create the job in INTAKE status, in one call.
   */
  async createIntake(organizationId: string, garageId: string, actorUserId: string, input: CreateJobInput) {
    const customerId = await this.resolveCustomer(organizationId, input);
    const vehicleId = await this.resolveVehicle(organizationId, input, customerId);

    const job = await this.prisma.client.job.create({
      data: {
        organizationId,
        garageId,
        customerId,
        vehicleId,
        complaint: input.complaint,
        mileageAtIntake: input.mileageAtIntake,
        status: JobStatus.INTAKE,
      },
    });

    await this.prisma.client.jobStatusEvent.create({
      data: { jobId: job.id, toStatus: JobStatus.INTAKE, actorUserId },
    });

    if (input.mileageAtIntake != null) {
      await this.prisma.client.vehicle.update({
        where: { id: vehicleId, organizationId },
        data: { lastKnownMileage: input.mileageAtIntake },
      });
    }

    await this.audit.record({
      organizationId,
      entityType: "Job",
      entityId: job.id,
      action: "JOB_CREATED_INTAKE",
      actorUserId,
      afterState: job,
      jobId: job.id,
      affectsBoard: true,
    });

    return job;
  }

  private async resolveCustomer(organizationId: string, input: CreateJobInput): Promise<string> {
    if (input.customerId) {
      const customer = await this.prisma.client.customer.findFirst({
        where: { id: input.customerId, organizationId, deletedAt: null },
      });
      if (!customer) throw AppError.notFound("CUSTOMER_NOT_FOUND", "Customer not found");
      return customer.id;
    }
    const created = await this.prisma.client.customer.create({
      data: { organizationId, ...input.newCustomer! },
    });
    return created.id;
  }

  /**
   * The `defaultOwnerCustomerId` fallback exists because the intake form
   * (garage-web's NewJobSheet) doesn't ask "who owns this car?" as a
   * separate question from "who brought it in?" — in the overwhelming
   * majority of real intakes they're the same person, so a *new* vehicle
   * created alongside this job defaults to the job's own customer as
   * current owner (docs/OWNER-APP.md §"Owner/garage relationship"). An
   * explicit `newVehicle.ownerCustomerId` (e.g. the standalone "add
   * vehicle" form, where a garage might register a car for someone other
   * than who's standing at the counter) always wins. Without this,
   * VehicleOwnerHistory stayed empty for nearly every vehicle in the
   * system, which is what the owner app's "my vehicles" query depends on.
   */
  private async resolveVehicle(
    organizationId: string,
    input: CreateJobInput,
    defaultOwnerCustomerId: string,
  ): Promise<string> {
    if (input.vehicleId) {
      const vehicle = await this.prisma.client.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId, deletedAt: null },
      });
      if (!vehicle) throw AppError.notFound("VEHICLE_NOT_FOUND", "Vehicle not found");
      return vehicle.id;
    }
    const { ownerCustomerId, ...vehicleData } = input.newVehicle!;
    const created = await this.prisma.client.vehicle.create({
      data: { organizationId, ...vehicleData },
    });
    await this.prisma.client.vehicleOwnerHistory.create({
      data: { vehicleId: created.id, customerId: ownerCustomerId ?? defaultOwnerCustomerId },
    });
    return created.id;
  }

  async assignTechnician(
    organizationId: string,
    garageId: string,
    jobId: string,
    actorUserId: string,
    input: AssignTechnicianInput,
  ) {
    const job = await this.getById(organizationId, jobId);

    const technician = await this.prisma.client.staffMember.findFirst({
      where: { id: input.staffMemberId, organizationId, garageId, active: true },
    });
    if (!technician) {
      throw AppError.notFound("STAFF_MEMBER_NOT_FOUND", "Staff member not found at this garage");
    }

    const updated = await this.prisma.client.job.update({
      where: { id: jobId, organizationId },
      data: { assignedTechnicianId: technician.id },
    });

    await this.audit.record({
      organizationId,
      entityType: "Job",
      entityId: jobId,
      action: "JOB_TECHNICIAN_ASSIGNED",
      actorUserId,
      beforeState: { assignedTechnicianId: job.assignedTechnicianId },
      afterState: { assignedTechnicianId: technician.id },
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  /**
   * State-machine-validated status transition (docs/DOMAIN.md §5). This is
   * the ONLY place Job.status is ever written outside of createIntake.
   */
  async transitionStatus(
    organizationId: string,
    jobId: string,
    actorUserId: string,
    actorRole: Role,
    toStatus: JobStatus,
    note?: string,
  ) {
    const job = await this.getById(organizationId, jobId);
    const fromStatus = job.status;

    const transition = findTransition(fromStatus, toStatus);
    if (!transition) {
      throw AppError.conflict(
        "JOB_INVALID_TRANSITION",
        `Cannot move job from ${fromStatus} to ${toStatus}`,
        { from: fromStatus, to: toStatus },
      );
    }
    if (!transition.allowedRoles.includes(actorRole)) {
      throw AppError.forbidden(
        "FORBIDDEN_TRANSITION",
        `Role ${actorRole} may not move a job from ${fromStatus} to ${toStatus}`,
      );
    }

    await this.assertTransitionPreconditions(organizationId, jobId, fromStatus, toStatus);

    const timestampField = JOB_TIMESTAMP_FIELD[toStatus];

    let updated;
    try {
      updated = await this.prisma.client.$transaction(async (tx) => {
      // Optimistic concurrency: the WHERE clause requires the row to
      // still be in `fromStatus` (the value this request read before
      // validating the transition). Two concurrent requests reading the
      // same stale status could otherwise both pass validation and both
      // write — Postgres row-locking serializes the two UPDATEs, but
      // without this guard the second one still succeeds unconditionally,
      // silently overwriting the first with a JobStatusEvent whose
      // `fromStatus` no longer matches reality. If zero rows match here,
      // Prisma throws P2025, caught below as a 409 (docs/DECISIONS.md).
      const job = await tx.job.update({
        where: { id: jobId, organizationId, status: fromStatus },
        data: {
          status: toStatus,
          ...(timestampField ? { [timestampField]: new Date() } : {}),
        },
      });
      await tx.jobStatusEvent.create({
        data: { jobId, fromStatus, toStatus, actorUserId, note },
      });

      // COLLECTED triggers a permanent ServiceRecord and the job then
      // moves straight to the terminal CLOSED state (docs/DOMAIN.md §5,
      // §12 "Aftercare") — this is not a separate staff action, it's the
      // automatic consequence of "the customer picked up the vehicle."
      // Inlined (rather than a separately-typed helper) because the
      // interactive-transaction client's extended type isn't structurally
      // assignable back to Prisma's own TransactionClient type — same
      // constraint noted in approvals.service.ts.
      if (toStatus === JobStatus.COLLECTED) {
        const [diagnoses, notes, approvedEstimate, parts, labor, invoice] = await Promise.all([
          tx.diagnosis.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
          tx.jobNote.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
          tx.estimate.findFirst({
            where: { jobId, organizationId, status: { in: ["APPROVED", "SENT"] } },
            orderBy: { version: "desc" },
            include: { items: true },
          }),
          tx.jobPart.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
          tx.jobLabor.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
          tx.invoice.findFirst({
            where: { jobId, organizationId, status: "ISSUED" },
            orderBy: { version: "desc" },
            include: { items: true, payments: { where: { voidedAt: null } } },
          }),
        ]);

        const amountPaid = invoice?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0;
        const warrantyMonths = parts.reduce((max, p) => Math.max(max, p.warrantyMonths ?? 0), 0);

        await tx.serviceRecord.create({
          data: {
            jobId,
            vehicleId: job.vehicleId,
            organizationId,
            garageId: job.garageId,
            serviceDate: new Date(),
            mileage: job.mileageAtIntake,
            summary: {
              complaint: job.complaint,
              diagnoses: diagnoses.map((d) => ({
                observedProblem: d.observedProblem,
                confirmedCause: d.confirmedCause,
                recommendedRepair: d.recommendedRepair,
                severity: d.severity,
                createdAt: d.createdAt.toISOString(),
              })),
              notes: notes.map((n) => ({ note: n.note, createdAt: n.createdAt.toISOString() })),
              workPerformed: {
                parts: parts.map((p) => ({
                  name: p.name,
                  partNumber: p.partNumber,
                  brand: p.brand,
                  condition: p.condition,
                  quantity: p.quantity,
                  warrantyMonths: p.warrantyMonths,
                })),
                labor: labor.map((l) => ({ description: l.description, hours: l.hours })),
              },
              estimateApproved: approvedEstimate
                ? {
                    version: approvedEstimate.version,
                    total: approvedEstimate.total,
                    items: approvedEstimate.items.map((i) => ({ description: i.description, type: i.type })),
                  }
                : null,
              invoice: invoice
                ? { total: invoice.total, currency: invoice.currency, amountPaid, balance: invoice.total - amountPaid }
                : null,
              warrantyMonths: warrantyMonths || null,
            },
          },
        });

        const closed = await tx.job.update({
          where: { id: jobId, organizationId, status: JobStatus.COLLECTED },
          data: { status: JobStatus.CLOSED },
        });
        await tx.jobStatusEvent.create({
          data: {
            jobId,
            fromStatus: JobStatus.COLLECTED,
            toStatus: JobStatus.CLOSED,
            actorUserId,
            note: "Auto-closed after service record was created",
          },
        });

        return closed;
      }

      return job;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw AppError.conflict(
          "JOB_CONCURRENTLY_MODIFIED",
          "This job was updated by someone else just now — refresh and try again",
          { from: fromStatus, to: toStatus },
        );
      }
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: "Job",
      entityId: jobId,
      action: "JOB_STATUS_CHANGED",
      actorUserId,
      beforeState: { status: fromStatus },
      afterState: { status: toStatus, note },
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  /**
   * Preconditions that aren't expressible in the static transition table
   * (docs/DOMAIN.md §5): an estimate must exist before requesting approval,
   * and an approval decision must exist before a job is considered approved.
   */
  private async assertTransitionPreconditions(
    organizationId: string,
    jobId: string,
    fromStatus: JobStatus,
    toStatus: JobStatus,
  ) {
    if (fromStatus === JobStatus.DIAGNOSING && toStatus === JobStatus.WAITING_APPROVAL) {
      const estimate = await this.prisma.client.estimate.findFirst({
        where: { jobId, organizationId, status: { in: ["SENT", "APPROVED"] } },
      });
      if (!estimate) {
        throw AppError.conflict(
          "ESTIMATE_REQUIRED",
          "An estimate must be created and sent before requesting customer approval",
        );
      }
    }

    if (fromStatus === JobStatus.WAITING_APPROVAL && toStatus === JobStatus.APPROVED) {
      const approval = await this.prisma.client.approval.findFirst({
        where: {
          jobId,
          organizationId,
          itemDecisions: { some: { decision: "APPROVED" } },
        },
      });
      if (!approval) {
        throw AppError.conflict(
          "APPROVAL_REQUIRED",
          "At least one approved item is required before marking the job approved",
        );
      }
    }

    if (fromStatus === JobStatus.READY && toStatus === JobStatus.COLLECTED) {
      const invoice = await this.prisma.client.invoice.findFirst({
        where: { jobId, organizationId, status: "ISSUED" },
      });
      if (!invoice) {
        throw AppError.conflict(
          "INVOICE_REQUIRED",
          "An issued invoice is required before the vehicle can be marked collected",
        );
      }
    }
  }
}
