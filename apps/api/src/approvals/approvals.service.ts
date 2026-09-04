import { Injectable } from "@nestjs/common";
import { ApprovalDecision, EstimateStatus } from "@le-garage/database";
import type { CreateApprovalInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
   */
  async create(organizationId: string, estimateId: string, actorStaffId: string, actorUserId: string, input: CreateApprovalInput) {
    const estimate = await this.prisma.client.estimate.findFirst({
      where: { id: estimateId, organizationId },
      include: { items: true },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "Estimate not found");
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
          loggedByStaffId: input.method === "IN_APP" ? null : actorStaffId,
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
    });

    return approval;
  }
}
