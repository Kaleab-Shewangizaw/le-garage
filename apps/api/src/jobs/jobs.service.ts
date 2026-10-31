import { Injectable } from "@nestjs/common";
import { EstimateStatus, JobStatus, OrganizationKind, Prisma, Role, VehicleStatus } from "@le-garage/database";
import type { AssignServiceProviderInput, AssignTechnicianInput, CreateJobInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { getOrganizationKind } from "../common/organization-kind";
import { activeWorkOrderForFleetJob } from "../common/work-order-lock";
import { AuditService } from "../audit/audit.service";
import { findTransition } from "./job-state-machine";

/** A job in any of these states no longer keeps its vehicle off the road. */
const TERMINAL_JOB_STATUSES: JobStatus[] = [JobStatus.COLLECTED, JobStatus.CLOSED, JobStatus.CANCELLED];

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
                { serviceProvider: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        vehicle: true,
        customer: true,
        serviceProvider: true,
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
        serviceProvider: true,
        assignedTechnician: { include: { user: { select: { fullName: true } } } },
        diagnoses: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "asc" } },
        estimates: { orderBy: { version: "desc" }, include: { items: true } },
        approvals: {
          orderBy: { createdAt: "asc" },
          include: {
            itemDecisions: true,
            decidedByStaff: { select: { id: true, role: true, user: { select: { fullName: true } } } },
          },
        },
        parts: { orderBy: { createdAt: "asc" } },
        labor: { orderBy: { createdAt: "asc" } },
        invoices: { orderBy: { version: "desc" }, include: { items: true, payments: true } },
      },
    });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return { ...job, workOrder: await this.workOrderSummary(organizationId, id) };
  }

  /**
   * The work order linking this job to the other company (docs/WORK-ORDERS.md),
   * seen from whichever side is asking: a fleet sees the garage it went to, a
   * garage sees the fleet it came from. Only names cross the boundary here.
   */
  private async workOrderSummary(organizationId: string, jobId: string) {
    const workOrder = await this.prisma.client.workOrder.findFirst({
      where: { OR: [{ fleetOrganizationId: organizationId, fleetJobId: jobId }, { garageOrganizationId: organizationId, garageJobId: jobId }] },
      orderBy: { sentAt: "desc" },
    });
    if (!workOrder) return null;
    const isFleetSide = workOrder.fleetOrganizationId === organizationId;
    const partner = await this.prisma.client.organization.findUnique({
      where: { id: isFleetSide ? workOrder.garageOrganizationId : workOrder.fleetOrganizationId },
      select: { name: true },
    });
    return {
      id: workOrder.id,
      status: workOrder.status,
      side: isFleetSide ? ("FLEET" as const) : ("GARAGE" as const),
      partnerName: partner?.name ?? "Unknown organization",
      message: workOrder.message,
      declineReason: workOrder.declineReason,
      sentAt: workOrder.sentAt,
      respondedAt: workOrder.respondedAt,
    };
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
   * create the job in INTAKE status, in one call. For a FLEET organization
   * this is "report a vehicle problem" (docs/FLEET.md): there is no
   * customer — the company owns the vehicle — and the repair may be
   * pre-assigned to one of the company's own service providers.
   */
  async createIntake(organizationId: string, garageId: string, actorUserId: string, input: CreateJobInput) {
    const kind = await getOrganizationKind(this.prisma, organizationId);
    const hasCustomer = !!(input.customerId || input.newCustomer);

    if (kind === OrganizationKind.FLEET && hasCustomer) {
      throw AppError.badRequest(
        "FLEET_JOB_HAS_NO_CUSTOMER",
        "Repairs for your own fleet don't take a customer — the vehicle belongs to your organization",
      );
    }
    if (kind === OrganizationKind.GARAGE) {
      if (!hasCustomer) {
        throw AppError.badRequest("CUSTOMER_REQUIRED", "Provide exactly one of customerId or newCustomer");
      }
      if (input.serviceProviderId) {
        throw AppError.badRequest("SERVICE_PROVIDER_NOT_SUPPORTED", "Service providers apply to fleet organizations only");
      }
    }

    const customerId = hasCustomer ? await this.resolveCustomer(organizationId, input) : null;
    const serviceProviderId = input.serviceProviderId
      ? (await this.resolveServiceProvider(organizationId, input.serviceProviderId)).id
      : null;
    const vehicleId = await this.resolveVehicle(organizationId, input, customerId);

    const job = await this.prisma.client.job.create({
      data: {
        organizationId,
        garageId,
        customerId,
        vehicleId,
        serviceProviderId,
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

    if (kind === OrganizationKind.FLEET) {
      await this.syncVehicleAvailability(organizationId, vehicleId, actorUserId);
    }

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
    defaultOwnerCustomerId: string | null,
  ): Promise<string> {
    if (input.vehicleId) {
      const vehicle = await this.prisma.client.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId, deletedAt: null },
      });
      if (!vehicle) throw AppError.notFound("VEHICLE_NOT_FOUND", "Vehicle not found");
      if (vehicle.status === VehicleStatus.RETIRED) {
        throw AppError.conflict("VEHICLE_RETIRED", "This vehicle is retired — reactivate it before opening a repair");
      }
      return vehicle.id;
    }
    const { ownerCustomerId, ...vehicleData } = input.newVehicle!;
    const created = await this.prisma.client.vehicle.create({
      data: { organizationId, ...vehicleData },
    });
    // A fleet vehicle has no Customer owner — the organization owns it —
    // so there's no VehicleOwnerHistory row to write.
    const ownerId = ownerCustomerId ?? defaultOwnerCustomerId;
    if (ownerId) {
      await this.prisma.client.vehicleOwnerHistory.create({
        data: { vehicleId: created.id, customerId: ownerId },
      });
    }
    return created.id;
  }

  private async resolveServiceProvider(organizationId: string, serviceProviderId: string) {
    const provider = await this.prisma.client.serviceProvider.findFirst({
      where: { id: serviceProviderId, organizationId, active: true },
    });
    if (!provider) {
      throw AppError.notFound("SERVICE_PROVIDER_NOT_FOUND", "Service provider not found");
    }
    return provider;
  }

  /** Fleet orgs: which external provider is doing this repair (docs/FLEET.md). */
  async assignServiceProvider(
    organizationId: string,
    jobId: string,
    actorUserId: string,
    input: AssignServiceProviderInput,
  ) {
    if ((await getOrganizationKind(this.prisma, organizationId)) !== OrganizationKind.FLEET) {
      throw AppError.badRequest("SERVICE_PROVIDER_NOT_SUPPORTED", "Service providers apply to fleet organizations only");
    }
    const job = await this.getById(organizationId, jobId);
    if (TERMINAL_JOB_STATUSES.includes(job.status)) {
      throw AppError.conflict("JOB_CLOSED", "This repair is already finished");
    }
    const serviceProviderId = input.serviceProviderId
      ? (await this.resolveServiceProvider(organizationId, input.serviceProviderId)).id
      : null;

    const updated = await this.prisma.client.job.update({
      where: { id: jobId, organizationId },
      data: { serviceProviderId },
    });

    await this.audit.record({
      organizationId,
      entityType: "Job",
      entityId: jobId,
      action: "JOB_SERVICE_PROVIDER_ASSIGNED",
      actorUserId,
      beforeState: { serviceProviderId: job.serviceProviderId },
      afterState: { serviceProviderId },
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  /**
   * Fleet vehicle availability follows its repairs: a vehicle with any open
   * repair is IN_MAINTENANCE; once the last one closes it goes back to
   * ACTIVE. Only flips between those two — UNAVAILABLE and RETIRED are a
   * manager's deliberate call and are never overridden. Recomputed from
   * the current set of open jobs (not toggled), so it self-corrects.
   */
  private async syncVehicleAvailability(organizationId: string, vehicleId: string, actorUserId: string) {
    const [vehicle, openJobs] = await Promise.all([
      this.prisma.client.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { status: true } }),
      this.prisma.client.job.count({
        where: { organizationId, vehicleId, deletedAt: null, status: { notIn: TERMINAL_JOB_STATUSES } },
      }),
    ]);
    if (!vehicle) return;

    let next: VehicleStatus | null = null;
    if (openJobs > 0 && vehicle.status === VehicleStatus.ACTIVE) next = VehicleStatus.IN_MAINTENANCE;
    if (openJobs === 0 && vehicle.status === VehicleStatus.IN_MAINTENANCE) next = VehicleStatus.ACTIVE;
    if (!next) return;

    await this.prisma.client.vehicle.update({ where: { id: vehicleId, organizationId }, data: { status: next } });
    await this.audit.record({
      organizationId,
      entityType: "Vehicle",
      entityId: vehicleId,
      action: "VEHICLE_STATUS_CHANGED",
      actorUserId,
      beforeState: { status: vehicle.status },
      afterState: { status: next, reason: openJobs > 0 ? "repair opened" : "last open repair closed" },
    });
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
    options: { viaWorkOrder?: boolean } = {},
  ) {
    const job = await this.getById(organizationId, jobId);
    const fromStatus = job.status;

    // A fleet repair a garage is handling moves with the garage's progress
    // (WorkOrderSyncService). The fleet may still call off a request the
    // garage hasn't accepted yet.
    if (!options.viaWorkOrder) {
      const workOrder = await activeWorkOrderForFleetJob(this.prisma, organizationId, jobId);
      if (workOrder && !(workOrder.status === "SENT" && toStatus === JobStatus.CANCELLED)) {
        throw AppError.conflict(
          "HANDLED_BY_GARAGE",
          "This repair's progress is updated by the garage doing the work",
          { workOrderId: workOrder.id },
        );
      }
    }

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

    if (TERMINAL_JOB_STATUSES.includes(updated.status)) {
      if ((await getOrganizationKind(this.prisma, organizationId)) === OrganizationKind.FLEET) {
        await this.syncVehicleAvailability(organizationId, job.vehicleId, actorUserId);
      }
    }

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
      // The approval must be on the *current* estimate. Checking for any
      // approval on the job let an approval of version 1 unlock a revised,
      // never-approved version 2 (financial-control gap, docs/FLEET.md).
      const current = await this.prisma.client.estimate.findFirst({
        where: { jobId, organizationId, status: { not: EstimateStatus.DRAFT } },
        orderBy: { version: "desc" },
      });
      const approval =
        current && current.status !== EstimateStatus.REJECTED && current.status !== EstimateStatus.SUPERSEDED
          ? await this.prisma.client.approval.findFirst({
              where: {
                jobId,
                organizationId,
                estimateId: current.id,
                itemDecisions: { some: { decision: "APPROVED" } },
              },
            })
          : null;
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
