import { Injectable } from "@nestjs/common";
import { ApprovalDecision, ApprovalMethod, EstimateStatus, JobStatus, OrganizationKind, Role } from "@le-garage/database";
import type { CreateApprovalInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { getOrganizationKind } from "../common/organization-kind";
import { AuditService } from "../audit/audit.service";
import { JobsService } from "../jobs/jobs.service";
import { workOrderForGarageJob } from "../common/work-order-lock";

/** Request bodies can't carry FLEET_PORTAL (validation); only WorkOrderSyncService passes it, with `fleetPortal`. */
type ApprovalInput = Omit<CreateApprovalInput, "method"> & { method: CreateApprovalInput["method"] | "FLEET_PORTAL" };

/** Who may approve repair spend in a fleet organization (docs/FLEET.md). */
const FLEET_APPROVER_ROLES: Role[] = [Role.OWNER, Role.MANAGER];

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  async listForJob(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return this.prisma.client.approval.findMany({
      where: { jobId, organizationId },
      include: { itemDecisions: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Records what was approved/rejected, scoped to specific EstimateItems
   * (docs/DOMAIN.md §3/§6 — "approve selected items" is first-class, not a
   * free-text workaround). Only a SENT estimate can be decided on — this
   * is what makes the record trustworthy: the estimate that was approved
   * cannot change after the fact (docs/SECURITY.md §3).
   *
   * In a FLEET organization the decision is the company's own spend
   * control (docs/FLEET.md): only an OWNER/MANAGER may make it, it is
   * always recorded as STAFF_DECISION with the deciding staff member, and
   * an approval of at least one item moves the repair straight to
   * APPROVED. `actorRole` is required for that check — the owner-app path
   * (no staff role) can never decide on a fleet estimate.
   */
  async create(
    organizationId: string,
    estimateId: string,
    actorStaffId: string | null,
    actorUserId: string,
    input: ApprovalInput,
    decidedByCustomerId?: string,
    actorRole?: Role,
    /** WorkOrderSyncService only: a fleet's decision on this garage's estimate, made in the fleet's own account. */
    fleetPortal?: { decidedByStaffId: string },
  ) {
    const kind = await getOrganizationKind(this.prisma, organizationId);
    const isFleet = kind === OrganizationKind.FLEET;

    if (input.method === ApprovalMethod.FLEET_PORTAL && !fleetPortal) {
      throw AppError.badRequest("INVALID_APPROVAL_METHOD", "FLEET_PORTAL decisions are recorded by Le Garage, not submitted");
    }

    if (isFleet) {
      if (!actorRole || !actorStaffId || !FLEET_APPROVER_ROLES.includes(actorRole)) {
        throw AppError.forbidden("APPROVER_ROLE_REQUIRED", "Only an owner or supervisor can approve or reject repair costs");
      }
      if (input.method !== ApprovalMethod.STAFF_DECISION) {
        throw AppError.badRequest("INVALID_APPROVAL_METHOD", "Fleet approvals are recorded as STAFF_DECISION");
      }
    } else if (input.method === ApprovalMethod.STAFF_DECISION) {
      throw AppError.badRequest(
        "INVALID_APPROVAL_METHOD",
        "Garage staff record the customer's decision — STAFF_DECISION is for fleet organizations",
      );
    }

    const estimate = await this.prisma.client.estimate.findFirst({
      where: { id: estimateId, organizationId },
      include: { items: true },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "Estimate not found");
    }
    if (!isFleet && !fleetPortal && (await workOrderForGarageJob(this.prisma, organizationId, estimate.jobId))) {
      throw AppError.conflict(
        "APPROVAL_BY_FLEET",
        "This job is a work order from a fleet — they approve the estimate in their own Le Garage account",
      );
    }
    if (estimate.status !== EstimateStatus.SENT) {
      throw AppError.conflict(
        "ESTIMATE_NOT_SENT",
        "Only a SENT estimate can be approved or rejected — this one is " + estimate.status,
      );
    }

    const validItemIds = new Set(estimate.items.map((i) => i.id));
    for (const decision of input.itemDecisions) {
      if (!validItemIds.has(decision.estimateItemId)) {
        throw AppError.badRequest(
          "INVALID_ESTIMATE_ITEM",
          `Estimate item ${decision.estimateItemId} does not belong to estimate ${estimateId}`,
        );
      }
    }

    const approval = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.approval.create({
        data: {
          organizationId,
          jobId: estimate.jobId,
          estimateId,
          method: input.method,
          note: input.note,
          loggedByStaffId: input.method === "IN_APP" || isFleet || fleetPortal ? null : actorStaffId,
          decidedByStaffId: isFleet ? actorStaffId : (fleetPortal?.decidedByStaffId ?? null),
          decidedByCustomerId: decidedByCustomerId ?? null,
        },
      });

      await tx.approvalItemDecision.createMany({
        data: input.itemDecisions.map((d) => ({
          approvalId: created.id,
          estimateItemId: d.estimateItemId,
          decision: d.decision,
        })),
      });

      // An item's *current* decision is the most recent
      // ApprovalItemDecision recorded against it (a customer can change
      // their mind before the job moves forward; each decision is still
      // preserved for history). Whether the estimate as a whole becomes
      // APPROVED/REJECTED depends on every item having a latest decision
      // of that kind; a mix leaves it SENT — that's the "approve selected
      // items" case (docs/DOMAIN.md §6). Inlined here (rather than a
      // separately-typed helper) because the interactive-transaction
      // client's extended type isn't structurally assignable back to
      // Prisma's own TransactionClient type.
      const decisions = await tx.approvalItemDecision.findMany({
        where: { approval: { estimateId } },
        include: { approval: { select: { createdAt: true } } },
      });
      const latestPerItem = new Map<string, ApprovalDecision>();
      for (const d of [...decisions].sort((a, b) => b.approval.createdAt.getTime() - a.approval.createdAt.getTime())) {
        if (!latestPerItem.has(d.estimateItemId)) {
          latestPerItem.set(d.estimateItemId, d.decision);
        }
      }
      let newEstimateStatus: EstimateStatus | null = null;
      if (latestPerItem.size >= estimate.items.length) {
        const values = [...latestPerItem.values()];
        if (values.every((v) => v === ApprovalDecision.APPROVED)) newEstimateStatus = EstimateStatus.APPROVED;
        else if (values.every((v) => v === ApprovalDecision.REJECTED)) newEstimateStatus = EstimateStatus.REJECTED;
      }
      if (newEstimateStatus) {
        await tx.estimate.update({
          where: { id: estimateId, organizationId },
          data: { status: newEstimateStatus, decidedAt: new Date() },
        });
      }

      return tx.approval.findFirstOrThrow({
        where: { id: created.id, organizationId },
        include: { itemDecisions: true },
      });
    });

    await this.audit.record({
      organizationId,
      entityType: "Approval",
      entityId: approval.id,
      action: "APPROVAL_RECORDED",
      actorUserId,
      afterState: approval,
      jobId: estimate.jobId,
      affectsBoard: true,
    });

    if (isFleet && input.itemDecisions.some((d) => d.decision === ApprovalDecision.APPROVED)) {
      const job = await this.prisma.client.job.findFirst({
        where: { id: estimate.jobId, organizationId },
        select: { status: true },
      });
      if (job?.status === JobStatus.WAITING_APPROVAL) {
        await this.jobs.transitionStatus(
          organizationId,
          estimate.jobId,
          actorUserId,
          actorRole!,
          JobStatus.APPROVED,
          "Approved by supervisor",
          { viaWorkOrder: true },
        );
      }
    }

    return approval;
  }
}
