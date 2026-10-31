import { Injectable } from "@nestjs/common";
import { JobStatus, OrganizationKind, Role, WorkOrderStatus } from "@le-garage/database";
import type { DeclineWorkOrderInput, SendWorkOrderInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { getOrganizationKind } from "../common/organization-kind";
import { activeWorkOrderForFleetJob } from "../common/work-order-lock";
import { AuditService } from "../audit/audit.service";
import { JobsService } from "../jobs/jobs.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";

const GARAGE_INTAKE_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK];
const FLEET_FOLLOW_UP_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK];

/**
 * Work orders (docs/WORK-ORDERS.md): a fleet company sends one of its
 * repairs to a garage that also uses Le Garage; the garage accepts it and
 * does the work in its *own* account. The two companies never share a
 * record — each keeps its own Job, and this service is the only place that
 * creates the link between them. WorkOrderSyncService keeps the fleet's
 * copy up to date as the garage works.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly notify: StaffNotificationsService,
  ) {}

  /** Fleet: send a repair to its connected garage. */
  async send(fleetOrganizationId: string, fleetJobId: string, actorUserId: string, input: SendWorkOrderInput) {
    if ((await getOrganizationKind(this.prisma, fleetOrganizationId)) !== OrganizationKind.FLEET) {
      throw AppError.badRequest("FLEET_ONLY", "Only fleet companies send work orders");
    }
    const job = await this.prisma.client.job.findFirst({
      where: { id: fleetJobId, organizationId: fleetOrganizationId, deletedAt: null },
      include: { serviceProvider: true, vehicle: true },
    });
    if (!job) throw AppError.notFound("JOB_NOT_FOUND", "Repair not found");
    if (job.status !== JobStatus.INTAKE && job.status !== JobStatus.DIAGNOSING) {
      throw AppError.conflict("WORK_ALREADY_STARTED", "Only a repair that hasn't been estimated yet can be sent to a garage");
    }
    if (!job.serviceProvider?.garageOrganizationId) {
      throw AppError.badRequest("PROVIDER_NOT_CONNECTED", "Choose a service provider that's on Le Garage first");
    }
    if (await activeWorkOrderForFleetJob(this.prisma, fleetOrganizationId, fleetJobId)) {
      throw AppError.conflict("WORK_ORDER_EXISTS", "This repair has already been sent to a garage");
    }
    const [estimates, garage] = await Promise.all([
      this.prisma.client.estimate.count({ where: { jobId: fleetJobId, organizationId: fleetOrganizationId } }),
      this.prisma.client.organization.findUnique({ where: { id: job.serviceProvider.garageOrganizationId } }),
    ]);
    if (estimates > 0) {
      throw AppError.conflict("WORK_ALREADY_STARTED", "This repair already has an estimate recorded by your team");
    }
    if (!garage || garage.kind !== OrganizationKind.GARAGE || garage.suspendedAt) {
      throw AppError.conflict("GARAGE_UNAVAILABLE", "That garage isn't accepting work orders on Le Garage right now");
    }

    const fleet = await this.prisma.client.organization.findUnique({ where: { id: fleetOrganizationId }, select: { name: true } });
    const workOrder = await this.prisma.client.workOrder.create({
      data: {
        fleetOrganizationId,
        fleetJobId,
        garageOrganizationId: garage.id,
        serviceProviderId: job.serviceProvider.id,
        message: input.message,
        sentByUserId: actorUserId,
      },
    });
    await this.audit.record({
      organizationId: fleetOrganizationId,
      entityType: "WorkOrder",
      entityId: workOrder.id,
      action: "WORK_ORDER_SENT",
      actorUserId,
      afterState: { garageOrganizationId: garage.id, message: input.message },
      jobId: fleetJobId,
      affectsBoard: true,
    });
    await this.audit.record({
      organizationId: garage.id,
      entityType: "WorkOrder",
      entityId: workOrder.id,
      action: "WORK_ORDER_RECEIVED",
      actorUserId,
      afterState: { fleetOrganizationId },
    });
    await this.notify.notifyOrganization(garage.id, GARAGE_INTAKE_ROLES, {
      type: "WORK_ORDER_RECEIVED",
      title: `New work order from ${fleet?.name}`,
      body: `${job.vehicle.licensePlate} ${job.vehicle.make} ${job.vehicle.model}: ${job.complaint}`,
      href: "/work-orders",
    });
    return workOrder;
  }

  /** Fleet: call off a request the garage hasn't accepted yet. */
  async cancel(fleetOrganizationId: string, workOrderId: string, actorUserId: string) {
    const workOrder = await this.prisma.client.workOrder.findFirst({ where: { id: workOrderId, fleetOrganizationId } });
    if (!workOrder) throw AppError.notFound("WORK_ORDER_NOT_FOUND", "Work order not found");
    if (workOrder.status !== WorkOrderStatus.SENT) {
      throw AppError.conflict("WORK_ORDER_NOT_PENDING", "The garage has already responded — contact them to stop the work");
    }
    await this.close(workOrder.id, fleetOrganizationId, WorkOrderStatus.CANCELLED, actorUserId);
    const fleet = await this.prisma.client.organization.findUnique({ where: { id: fleetOrganizationId }, select: { name: true } });
    await this.notify.notifyOrganization(workOrder.garageOrganizationId, GARAGE_INTAKE_ROLES, {
      type: "WORK_ORDER_CANCELLED",
      title: `${fleet?.name} cancelled a work order`,
      body: "They no longer need this repair.",
      href: "/work-orders",
    });
    return { success: true };
  }

  /** Both sides: work orders involving the caller's organization. */
  async list(organizationId: string, status?: WorkOrderStatus) {
    const workOrders = await this.prisma.client.workOrder.findMany({
      where: {
        OR: [{ fleetOrganizationId: organizationId }, { garageOrganizationId: organizationId }],
        ...(status ? { status } : {}),
      },
      orderBy: { sentAt: "desc" },
      take: 100,
    });
    // Fetch just what the garage needs to decide: who's asking and for which vehicle.
    const fleetJobs = await this.prisma.unscopedClient.job.findMany({
      where: { id: { in: workOrders.map((w) => w.fleetJobId) } },
      select: { id: true, complaint: true, mileageAtIntake: true, vehicle: { select: { licensePlate: true, make: true, model: true, year: true, vehicleType: true } } },
    });
    const orgIds = [...new Set(workOrders.flatMap((w) => [w.fleetOrganizationId, w.garageOrganizationId]))];
    const orgs = await this.prisma.unscopedClient.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const jobById = new Map(fleetJobs.map((j) => [j.id, j]));
    return workOrders.map((w) => {
      const isGarageSide = w.garageOrganizationId === organizationId;
      const fleetJob = jobById.get(w.fleetJobId);
      return {
        id: w.id,
        status: w.status,
        side: isGarageSide ? "GARAGE" : "FLEET",
        fleetName: orgName.get(w.fleetOrganizationId),
        garageName: orgName.get(w.garageOrganizationId),
        message: w.message,
        declineReason: w.declineReason,
        sentAt: w.sentAt,
        respondedAt: w.respondedAt,
        complaint: fleetJob?.complaint,
        mileage: fleetJob?.mileageAtIntake ?? null,
        vehicle: fleetJob?.vehicle,
        // Each side only ever gets a link to its *own* job.
        jobId: isGarageSide ? w.garageJobId : w.fleetJobId,
      };
    });
  }

  /**
   * Garage: accept — creates the garage's own job, filed under a customer
   * record for the fleet company and the garage's own copy of the vehicle.
   */
  async accept(garageOrganizationId: string, garageId: string, workOrderId: string, actorUserId: string) {
    const workOrder = await this.prisma.client.workOrder.findFirst({ where: { id: workOrderId, garageOrganizationId } });
    if (!workOrder) throw AppError.notFound("WORK_ORDER_NOT_FOUND", "Work order not found");
    if (workOrder.status !== WorkOrderStatus.SENT) {
      throw AppError.conflict("WORK_ORDER_NOT_PENDING", "This work order was already answered or cancelled");
    }
    // The fleet's side of the request, read through the verified work order link.
    const fleetJob = await this.prisma.unscopedClient.job.findFirst({
      where: { id: workOrder.fleetJobId, organizationId: workOrder.fleetOrganizationId },
      include: { vehicle: true, organization: { include: { garage: true } } },
    });
    if (!fleetJob) throw AppError.notFound("JOB_NOT_FOUND", "The fleet's repair no longer exists");

    const fleet = fleetJob.organization;
    let customer = await this.prisma.client.customer.findFirst({
      where: { organizationId: garageOrganizationId, linkedOrganizationId: fleet.id, deletedAt: null },
    });
    customer ??= await this.prisma.client.customer.create({
      data: {
        organizationId: garageOrganizationId,
        linkedOrganizationId: fleet.id,
        fullName: fleet.name,
        phone: fleet.garage?.phone ?? "—",
        notes: "Fleet customer on Le Garage — work arrives as work orders and they approve estimates in their own account.",
      },
    });

    const v = fleetJob.vehicle;
    let vehicle = await this.prisma.client.vehicle.findFirst({
      where: { organizationId: garageOrganizationId, licensePlate: v.licensePlate, deletedAt: null },
    });
    vehicle ??= await this.prisma.client.vehicle.create({
      data: {
        organizationId: garageOrganizationId,
        licensePlate: v.licensePlate,
        make: v.make,
        model: v.model,
        year: v.year,
        color: v.color,
        vehicleType: v.vehicleType,
        fuelType: v.fuelType,
        lastKnownMileage: fleetJob.mileageAtIntake ?? v.lastKnownMileage,
      },
    });

    const complaint = workOrder.message ? `${fleetJob.complaint}\n\nNote from ${fleet.name}: ${workOrder.message}` : fleetJob.complaint;
    const garageJob = await this.jobs.createIntake(garageOrganizationId, garageId, actorUserId, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      complaint,
      mileageAtIntake: fleetJob.mileageAtIntake ?? undefined,
    });

    await this.prisma.client.workOrder.update({
      where: { id: workOrder.id, garageOrganizationId },
      data: { status: WorkOrderStatus.ACCEPTED, garageJobId: garageJob.id, respondedByUserId: actorUserId, respondedAt: new Date() },
    });
    const garage = await this.prisma.client.organization.findUnique({ where: { id: garageOrganizationId }, select: { name: true } });
    await this.audit.record({
      organizationId: fleet.id,
      entityType: "WorkOrder",
      entityId: workOrder.id,
      action: "WORK_ORDER_ACCEPTED",
      actorUserId,
      jobId: fleetJob.id,
      affectsBoard: true,
    });
    await this.notify.notifyOrganization(fleet.id, FLEET_FOLLOW_UP_ROLES, {
      type: "WORK_ORDER_ACCEPTED",
      title: `${garage?.name} accepted your work order`,
      body: `${v.licensePlate}: ${fleetJob.complaint}`,
      href: `/jobs/${fleetJob.id}`,
    });
    return { workOrderId: workOrder.id, jobId: garageJob.id };
  }

  /** Garage: decline, with a reason the fleet will see. */
  async decline(garageOrganizationId: string, workOrderId: string, actorUserId: string, input: DeclineWorkOrderInput) {
    const workOrder = await this.prisma.client.workOrder.findFirst({ where: { id: workOrderId, garageOrganizationId } });
    if (!workOrder) throw AppError.notFound("WORK_ORDER_NOT_FOUND", "Work order not found");
    if (workOrder.status !== WorkOrderStatus.SENT) {
      throw AppError.conflict("WORK_ORDER_NOT_PENDING", "This work order was already answered or cancelled");
    }
    await this.prisma.client.workOrder.update({
      where: { id: workOrder.id, garageOrganizationId },
      data: { status: WorkOrderStatus.DECLINED, declineReason: input.reason, respondedByUserId: actorUserId, respondedAt: new Date() },
    });
    const garage = await this.prisma.client.organization.findUnique({ where: { id: garageOrganizationId }, select: { name: true } });
    await this.audit.record({
      organizationId: workOrder.fleetOrganizationId,
      entityType: "WorkOrder",
      entityId: workOrder.id,
      action: "WORK_ORDER_DECLINED",
      actorUserId,
      afterState: { reason: input.reason },
      jobId: workOrder.fleetJobId,
      affectsBoard: true,
    });
    await this.notify.notifyOrganization(workOrder.fleetOrganizationId, FLEET_FOLLOW_UP_ROLES, {
      type: "WORK_ORDER_DECLINED",
      title: `${garage?.name} declined a work order`,
      body: input.reason,
      href: `/jobs/${workOrder.fleetJobId}`,
    });
    return { success: true };
  }

  private async close(id: string, fleetOrganizationId: string, status: WorkOrderStatus, actorUserId: string) {
    await this.prisma.client.workOrder.update({ where: { id, fleetOrganizationId }, data: { status, respondedAt: new Date(), respondedByUserId: actorUserId } });
  }
}
