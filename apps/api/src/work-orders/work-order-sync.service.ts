import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ApprovalMethod, EstimateStatus, InvoiceStatus, JobStatus, Role, WorkOrderStatus, type WorkOrder } from "@le-garage/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { DomainEvents } from "../common/events/domain-events";
import { AuditService, type AuditEntry } from "../audit/audit.service";
import { JobsService } from "../jobs/jobs.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";

const FLEET_APPROVERS: Role[] = [Role.OWNER, Role.MANAGER];
const FLEET_FOLLOW_UP: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK];
const GARAGE_FRONT_OFFICE: Role[] = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK];

/** Garage progress the fleet hears about (the rest just updates the timeline). */
const STATUS_NOTICE: Partial<Record<JobStatus, string>> = {
  IN_PROGRESS: "Repair started",
  WAITING_PARTS: "Waiting for parts",
  READY: "Repair complete — the vehicle is ready",
  COLLECTED: "Vehicle handed back",
  CANCELLED: "The garage cancelled the repair",
};

const birr = (santim: number) => `ETB ${(santim / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * Keeps a fleet's repair in step with the garage doing the work
 * (docs/WORK-ORDERS.md). The garage's job is the source of truth for the
 * work; the fleet keeps *copies* of what it needs as the customer — the
 * findings, each estimate, the photos, the invoice — so its approvals,
 * vehicle availability, history and spend reports all run on its own data
 * and survive whatever the garage later does with its records. In the
 * other direction, the only thing that flows back is the fleet's decision
 * on an estimate.
 *
 * Driven by audited mutations (DomainEvents) rather than calls sprinkled
 * through the garage's services. Every copy carries the source id
 * (`external*Id`, unique), so a repeated event can never duplicate it.
 */
@Injectable()
export class WorkOrderSyncService implements OnModuleInit {
  private readonly logger = new Logger("WorkOrderSync");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEvents,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly approvals: ApprovalsService,
    private readonly notify: StaffNotificationsService,
  ) {}

  onModuleInit() {
    this.events.subscribe((entry) => this.handle(entry));
  }

  private async handle(entry: AuditEntry) {
    if (!entry.organizationId || !entry.jobId) return;
    const fromGarage = await this.prisma.client.workOrder.findFirst({
      where: { garageOrganizationId: entry.organizationId, garageJobId: entry.jobId, status: WorkOrderStatus.ACCEPTED },
    });
    if (fromGarage) return this.onGarageEvent(fromGarage, entry);

    const fromFleet = await this.prisma.client.workOrder.findFirst({
      where: { fleetOrganizationId: entry.organizationId, fleetJobId: entry.jobId, status: { in: [WorkOrderStatus.SENT, WorkOrderStatus.ACCEPTED] } },
    });
    if (fromFleet) return this.onFleetEvent(fromFleet, entry);
  }

  // ── Garage → fleet ──────────────────────────────────────────────────

  private async onGarageEvent(wo: WorkOrder, entry: AuditEntry) {
    switch (entry.action) {
      case "DIAGNOSIS_ADDED":
        return this.copyDiagnosis(wo, entry.entityId);
      case "ESTIMATE_SENT":
        return this.copyEstimate(wo, entry.entityId);
      case "JOB_STATUS_CHANGED":
        return this.mirrorStatus(wo, (entry.afterState as { status?: JobStatus } | undefined)?.status, entry.actorUserId ?? null);
      case "INVOICE_ISSUED":
        return this.copyInvoice(wo, entry.entityId);
      case "INVOICE_VOIDED":
        return this.voidInvoiceCopy(wo, entry.entityId);
      case "ATTACHMENT_ADDED":
        return this.copyAttachment(wo, entry.entityId);
    }
  }

  private async garageName(wo: WorkOrder) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: wo.garageOrganizationId }, select: { name: true } });
    return org?.name ?? "The garage";
  }

  private async copyDiagnosis(wo: WorkOrder, diagnosisId: string) {
    const d = await this.prisma.client.diagnosis.findFirst({ where: { id: diagnosisId, organizationId: wo.garageOrganizationId } });
    if (!d) return;
    if (await this.prisma.unscopedClient.diagnosis.findUnique({ where: { externalDiagnosisId: d.id } })) return;
    await this.prisma.client.diagnosis.create({
      data: {
        organizationId: wo.fleetOrganizationId,
        jobId: wo.fleetJobId,
        authorStaffId: d.authorStaffId,
        observedProblem: d.observedProblem,
        suspectedCause: d.suspectedCause,
        confirmedCause: d.confirmedCause,
        severity: d.severity,
        recommendedRepair: d.recommendedRepair,
        notes: d.notes,
        externalDiagnosisId: d.id,
      },
    });
    await this.audit.record({ organizationId: wo.fleetOrganizationId, entityType: "Diagnosis", entityId: d.id, action: "DIAGNOSIS_RECEIVED", jobId: wo.fleetJobId });
  }

  private async copyEstimate(wo: WorkOrder, estimateId: string) {
    const est = await this.prisma.client.estimate.findFirst({
      where: { id: estimateId, organizationId: wo.garageOrganizationId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!est) return;
    if (await this.prisma.unscopedClient.estimate.findUnique({ where: { externalEstimateId: est.id } })) return;

    const latest = await this.prisma.client.estimate.findFirst({
      where: { jobId: wo.fleetJobId, organizationId: wo.fleetOrganizationId },
      orderBy: { version: "desc" },
    });
    await this.prisma.client.$transaction(async (tx) => {
      // A revised quote replaces the one still waiting for a decision.
      await tx.estimate.updateMany({
        where: { jobId: wo.fleetJobId, organizationId: wo.fleetOrganizationId, status: EstimateStatus.SENT },
        data: { status: EstimateStatus.SUPERSEDED },
      });
      await tx.estimate.create({
        data: {
          organizationId: wo.fleetOrganizationId,
          jobId: wo.fleetJobId,
          version: (latest?.version ?? 0) + 1,
          status: EstimateStatus.SENT,
          currency: est.currency,
          subtotal: est.subtotal,
          taxTotal: est.taxTotal,
          discountTotal: est.discountTotal,
          total: est.total,
          createdByStaffId: est.createdByStaffId,
          sentAt: new Date(),
          externalEstimateId: est.id,
          items: {
            create: est.items.map((i) => ({
              type: i.type,
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
              lineTotal: i.lineTotal,
              externalItemId: i.id,
            })),
          },
        },
      });
    });

    // The fleet's repair now waits for its approver.
    const fleetJob = await this.prisma.client.job.findFirst({ where: { id: wo.fleetJobId, organizationId: wo.fleetOrganizationId } });
    if (fleetJob?.status === JobStatus.INTAKE) await this.tryTransition(wo, JobStatus.DIAGNOSING, null);
    const refreshed = await this.prisma.client.job.findFirst({ where: { id: wo.fleetJobId, organizationId: wo.fleetOrganizationId } });
    if (refreshed?.status === JobStatus.DIAGNOSING) await this.tryTransition(wo, JobStatus.WAITING_APPROVAL, null);

    const garage = await this.garageName(wo);
    await this.audit.record({ organizationId: wo.fleetOrganizationId, entityType: "Estimate", entityId: est.id, action: "ESTIMATE_RECEIVED", jobId: wo.fleetJobId, affectsBoard: true });
    await this.notify.notifyOrganization(wo.fleetOrganizationId, FLEET_APPROVERS, {
      type: "ESTIMATE_RECEIVED",
      title: `Estimate from ${garage} needs your approval`,
      body: `${birr(est.total)} — open the repair to approve or reject each item`,
      href: `/jobs/${wo.fleetJobId}`,
    });
  }

  private async mirrorStatus(wo: WorkOrder, to: JobStatus | undefined, actorUserId: string | null) {
    if (!to) return;
    const moved = await this.tryTransition(wo, to, actorUserId);
    const notice = STATUS_NOTICE[to];
    if (moved && notice) {
      const garage = await this.garageName(wo);
      await this.notify.notifyOrganization(wo.fleetOrganizationId, FLEET_FOLLOW_UP, {
        type: "REPAIR_PROGRESS",
        title: `${garage}: ${notice}`,
        body: "Open the repair to see the latest.",
        href: `/jobs/${wo.fleetJobId}`,
      });
    }
  }

  /** Moves the fleet's repair along the same state machine; quietly skips moves that don't apply (e.g. already there). */
  private async tryTransition(wo: WorkOrder, to: JobStatus, actorUserId: string | null): Promise<boolean> {
    const fleetJob = await this.prisma.client.job.findFirst({ where: { id: wo.fleetJobId, organizationId: wo.fleetOrganizationId } });
    if (!fleetJob || fleetJob.status === to || (to === JobStatus.CLOSED && fleetJob.status === JobStatus.CLOSED)) return false;
    const garage = await this.garageName(wo);
    try {
      await this.jobs.transitionStatus(wo.fleetOrganizationId, wo.fleetJobId, actorUserId ?? wo.sentByUserId, Role.OWNER, to, `Updated by ${garage}`, {
        viaWorkOrder: true,
      });
      return true;
    } catch (err) {
      this.logger.debug(`Skipped mirroring ${fleetJob.status} → ${to} on ${wo.fleetJobId}: ${(err as Error).message}`);
      return false;
    }
  }

  private async copyInvoice(wo: WorkOrder, invoiceId: string) {
    const inv = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, organizationId: wo.garageOrganizationId },
      include: { items: true },
    });
    if (!inv) return;
    if (await this.prisma.unscopedClient.invoice.findUnique({ where: { externalInvoiceId: inv.id } })) return;
    const latest = await this.prisma.client.invoice.findFirst({
      where: { jobId: wo.fleetJobId, organizationId: wo.fleetOrganizationId },
      orderBy: { version: "desc" },
    });
    await this.prisma.client.invoice.create({
      data: {
        organizationId: wo.fleetOrganizationId,
        jobId: wo.fleetJobId,
        version: (latest?.version ?? 0) + 1,
        status: InvoiceStatus.ISSUED,
        currency: inv.currency,
        subtotal: inv.subtotal,
        taxTotal: inv.taxTotal,
        discountTotal: inv.discountTotal,
        total: inv.total,
        issuedAt: inv.issuedAt ?? new Date(),
        createdByStaffId: inv.createdByStaffId,
        externalInvoiceId: inv.id,
        items: {
          create: inv.items.map((i) => ({ type: i.type, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: i.lineTotal })),
        },
      },
    });
    const garage = await this.garageName(wo);
    await this.audit.record({ organizationId: wo.fleetOrganizationId, entityType: "Invoice", entityId: inv.id, action: "INVOICE_RECEIVED", jobId: wo.fleetJobId, affectsBoard: true });
    await this.notify.notifyOrganization(wo.fleetOrganizationId, FLEET_FOLLOW_UP, {
      type: "INVOICE_RECEIVED",
      title: `Invoice from ${garage}`,
      body: `${birr(inv.total)} — record your payment on the repair's Invoice tab`,
      href: `/jobs/${wo.fleetJobId}`,
    });
  }

  private async voidInvoiceCopy(wo: WorkOrder, invoiceId: string) {
    const copy = await this.prisma.unscopedClient.invoice.findUnique({
      where: { externalInvoiceId: invoiceId },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!copy || copy.organizationId !== wo.fleetOrganizationId || copy.status !== InvoiceStatus.ISSUED) return;
    // If the fleet already paid against it, keep the record and let people sort it out.
    if (copy.payments.length > 0) {
      await this.notify.notifyOrganization(wo.fleetOrganizationId, FLEET_FOLLOW_UP, {
        type: "INVOICE_VOIDED",
        title: `${await this.garageName(wo)} voided an invoice you've paid against`,
        body: "Check with the garage — your payment record is unchanged.",
        href: `/jobs/${wo.fleetJobId}`,
      });
      return;
    }
    await this.prisma.client.invoice.update({
      where: { id: copy.id, organizationId: wo.fleetOrganizationId },
      data: { status: InvoiceStatus.VOID, voidedAt: new Date() },
    });
    await this.audit.record({ organizationId: wo.fleetOrganizationId, entityType: "Invoice", entityId: copy.id, action: "INVOICE_VOIDED_BY_GARAGE", jobId: wo.fleetJobId });
  }

  private async copyAttachment(wo: WorkOrder, attachmentId: string) {
    const a = await this.prisma.client.attachment.findFirst({ where: { id: attachmentId, organizationId: wo.garageOrganizationId } });
    if (!a || !a.jobId) return;
    if (await this.prisma.unscopedClient.attachment.findUnique({ where: { externalAttachmentId: a.id } })) return;
    const extension = a.objectKey.split(".").pop() ?? "bin";
    const objectKey = `${wo.fleetOrganizationId}/job/${wo.fleetJobId}/${randomUUID()}.${extension}`;
    await this.storage.copyObject(a.objectKey, objectKey);
    await this.prisma.client.attachment.create({
      data: {
        organizationId: wo.fleetOrganizationId,
        entityType: "JOB",
        jobId: wo.fleetJobId,
        objectKey,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        uploadedByStaffId: a.uploadedByStaffId,
        tag: a.tag,
        caption: a.caption,
        externalAttachmentId: a.id,
      },
    });
    await this.audit.record({ organizationId: wo.fleetOrganizationId, entityType: "Attachment", entityId: a.id, action: "ATTACHMENT_RECEIVED", jobId: wo.fleetJobId });
  }

  // ── Fleet → garage ──────────────────────────────────────────────────

  private async onFleetEvent(wo: WorkOrder, entry: AuditEntry) {
    if (entry.action === "APPROVAL_RECORDED" && wo.status === WorkOrderStatus.ACCEPTED) {
      return this.propagateDecision(wo, entry);
    }
    // The fleet called off a request the garage hadn't accepted yet.
    if (entry.action === "JOB_STATUS_CHANGED" && wo.status === WorkOrderStatus.SENT) {
      const to = (entry.afterState as { status?: JobStatus } | undefined)?.status;
      if (to === JobStatus.CANCELLED) {
        await this.prisma.client.workOrder.update({
          where: { id: wo.id, fleetOrganizationId: wo.fleetOrganizationId },
          data: { status: WorkOrderStatus.CANCELLED, respondedAt: new Date() },
        });
        await this.notify.notifyOrganization(wo.garageOrganizationId, GARAGE_FRONT_OFFICE, {
          type: "WORK_ORDER_CANCELLED",
          title: "A fleet cancelled a work order",
          body: "They no longer need this repair.",
          href: "/work-orders",
        });
      }
    }
  }

  private async propagateDecision(wo: WorkOrder, entry: AuditEntry) {
    const approval = entry.afterState as
      | { method: ApprovalMethod; estimateId: string; note: string | null; decidedByStaffId: string | null; itemDecisions: { estimateItemId: string; decision: "APPROVED" | "REJECTED" }[] }
      | undefined;
    if (!approval || approval.method !== ApprovalMethod.STAFF_DECISION || !approval.decidedByStaffId) return;

    const fleetEstimate = await this.prisma.client.estimate.findFirst({
      where: { id: approval.estimateId, organizationId: wo.fleetOrganizationId },
      include: { items: true },
    });
    if (!fleetEstimate?.externalEstimateId) return;
    const toGarageItem = new Map(fleetEstimate.items.map((i) => [i.id, i.externalItemId]));
    const itemDecisions = approval.itemDecisions
      .map((d) => ({ estimateItemId: toGarageItem.get(d.estimateItemId), decision: d.decision }))
      .filter((d): d is { estimateItemId: string; decision: "APPROVED" | "REJECTED" } => !!d.estimateItemId);
    if (itemDecisions.length === 0) return;

    const customer = await this.prisma.client.customer.findFirst({
      where: { organizationId: wo.garageOrganizationId, linkedOrganizationId: wo.fleetOrganizationId },
    });
    await this.approvals.create(
      wo.garageOrganizationId,
      fleetEstimate.externalEstimateId,
      null,
      entry.actorUserId ?? wo.sentByUserId,
      { method: ApprovalMethod.FLEET_PORTAL, note: approval.note ?? undefined, itemDecisions },
      customer?.id,
      undefined,
      { decidedByStaffId: approval.decidedByStaffId },
    );

    const approved = itemDecisions.filter((d) => d.decision === "APPROVED").length;
    const fleet = await this.prisma.client.organization.findUnique({ where: { id: wo.fleetOrganizationId }, select: { name: true } });
    await this.notify.notifyOrganization(wo.garageOrganizationId, GARAGE_FRONT_OFFICE, {
      type: "ESTIMATE_DECIDED",
      title:
        approved === 0
          ? `${fleet?.name} rejected your estimate`
          : `${fleet?.name} approved ${approved === itemDecisions.length ? "your estimate" : `${approved} of ${itemDecisions.length} items`}`,
      body: approval.note ?? (approved > 0 ? "You can mark the job approved and start the repair." : "Revise the estimate or cancel the job."),
      href: wo.garageJobId ? `/jobs/${wo.garageJobId}` : "/work-orders",
    });
  }
}
