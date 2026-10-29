import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { EstimateStatus } from "@le-garage/database";
import type { CreateEstimateInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { assertNotGarageHandled, workOrderForGarageJob } from "../common/work-order-lock";
import { AuditService } from "../audit/audit.service";
import { computeEstimateTotals, computeItemLineTotal } from "./money";

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.estimate.findMany({
      where: { jobId, organizationId },
      include: { items: true },
      orderBy: { version: "desc" },
    });
  }

  async latest(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    const estimate = await this.prisma.client.estimate.findFirst({
      where: { jobId, organizationId },
      include: { items: true },
      orderBy: { version: "desc" },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "No estimate exists for this job yet");
    }
    return estimate;
  }

  /**
   * Create or replace the job's DRAFT estimate. A DRAFT is mutable in
   * place because nothing has been shown to the customer yet
   * (docs/DOMAIN.md §6) — this is the ONLY estimate mutation path in the
   * system; once SENT, `send()` is the only further operation, and any
   * further change goes through this method again to create a new
   * version (see `send`).
   */
  async createOrReplaceDraft(
    organizationId: string,
    jobId: string,
    actorStaffId: string,
    actorUserId: string,
    input: CreateEstimateInput,
  ) {
    await this.assertJobExists(organizationId, jobId);
    await assertNotGarageHandled(this.prisma, organizationId, jobId);

    const totals = computeEstimateTotals(input.items, input.taxTotal);

    const existingDraft = await this.prisma.client.estimate.findFirst({
      where: { jobId, organizationId, status: EstimateStatus.DRAFT },
    });

    const estimate = await this.prisma.client.$transaction(async (tx) => {
      if (existingDraft) {
        await tx.estimateItem.deleteMany({ where: { estimateId: existingDraft.id } });
        return tx.estimate.update({
          where: { id: existingDraft.id, organizationId },
          data: {
            ...totals,
            items: {
              create: input.items.map((item) => ({
                type: item.type,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                lineTotal: computeItemLineTotal(item),
              })),
            },
          },
          include: { items: true },
        });
      }

      const latest = await tx.estimate.findFirst({
        where: { jobId, organizationId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      return tx.estimate.create({
        data: {
          organizationId,
          jobId,
          version: nextVersion,
          status: EstimateStatus.DRAFT,
          createdByStaffId: actorStaffId,
          ...totals,
          items: {
            create: input.items.map((item) => ({
              type: item.type,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              lineTotal: computeItemLineTotal(item),
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      organizationId,
      entityType: "Estimate",
      entityId: estimate.id,
      action: existingDraft ? "ESTIMATE_DRAFT_UPDATED" : "ESTIMATE_DRAFT_CREATED",
      actorUserId,
      afterState: estimate,
      jobId,
    });

    return estimate;
  }

  /**
   * Freezes a DRAFT estimate as SENT (docs/DOMAIN.md §6). From this point
   * the estimate and its items are immutable; any further change must go
   * through createOrReplaceDraft again, which will create version + 1.
   * Supersedes whichever estimate was previously SENT for this job, if any.
   */
  async send(organizationId: string, jobId: string, estimateId: string, actorUserId: string) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    const estimate = await this.prisma.client.estimate.findFirst({
      where: { id: estimateId, jobId, organizationId },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "Estimate not found");
    }
    if (estimate.status !== EstimateStatus.DRAFT) {
      throw AppError.conflict("ESTIMATE_NOT_DRAFT", "Only a DRAFT estimate can be sent");
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.estimate.updateMany({
        where: { jobId, organizationId, status: EstimateStatus.SENT },
        data: { status: EstimateStatus.SUPERSEDED },
      });
      return tx.estimate.update({
        where: { id: estimateId, organizationId },
        data: { status: EstimateStatus.SENT, sentAt: new Date() },
        include: { items: true },
      });
    });

    await this.audit.record({
      organizationId,
      entityType: "Estimate",
      entityId: estimateId,
      action: "ESTIMATE_SENT",
      actorUserId,
      afterState: updated,
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  /**
   * Lazily generates (or returns the existing) unguessable share token for
   * a SENT/decided estimate, so staff can hand a customer a read-only
   * link (docs/PRODUCT.md §"Customer Approval Experience") without the
   * customer needing an account. Only meaningful once an estimate has
   * actually been sent — sharing a DRAFT would leak un-communicated
   * pricing before the garage has committed to it.
   */
  async share(organizationId: string, jobId: string, estimateId: string, actorUserId: string) {
    const estimate = await this.prisma.client.estimate.findFirst({
      where: { id: estimateId, jobId, organizationId },
      include: { job: { select: { customerId: true } } },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "Estimate not found");
    }
    // A share link is an unauthenticated public URL meant for a garage's
    // customer. A fleet repair has no customer, and its costs are the
    // company's internal data — never expose them on a public link.
    if (!estimate.job.customerId || (await workOrderForGarageJob(this.prisma, organizationId, jobId))) {
      throw AppError.conflict("SHARE_NOT_AVAILABLE", "Public estimate links are only for walk-in customer repairs — fleet customers approve in Le Garage");
    }
    if (estimate.status === EstimateStatus.DRAFT) {
      throw AppError.conflict("ESTIMATE_NOT_SENT", "Send the estimate before sharing it with the customer");
    }
    if (estimate.shareToken) {
      return { shareToken: estimate.shareToken };
    }

    const shareToken = randomBytes(24).toString("base64url");
    await this.prisma.client.estimate.update({
      where: { id: estimateId, organizationId },
      data: { shareToken },
    });

    await this.audit.record({
      organizationId,
      entityType: "Estimate",
      entityId: estimateId,
      action: "ESTIMATE_SHARE_LINK_CREATED",
      actorUserId,
      jobId,
    });

    return { shareToken };
  }

  /**
   * The one deliberately unauthenticated read in the whole API (docs/
   * SECURITY.md §7-adjacent reasoning) — a customer has no account or
   * tenant context, only the link they were sent. Security rests entirely
   * on the token being unguessable (192 bits of randomness) and the query
   * being scoped to exactly one row by that token, never by organizationId
   * (there is none to scope by). Returns only what a customer needs to
   * understand and trust the estimate — no internal cost fields, no other
   * customers' data, nothing beyond this one job's complaint/vehicle/items.
   */
  async getByShareToken(shareToken: string) {
    const estimate = await this.prisma.unscopedClient.estimate.findUnique({
      where: { shareToken },
      include: {
        items: true,
        job: {
          select: {
            complaint: true,
            vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
            customer: { select: { fullName: true } },
            garage: { select: { name: true, phone: true } },
          },
        },
      },
    });
    if (!estimate) {
      throw AppError.notFound("ESTIMATE_NOT_FOUND", "This link is no longer valid");
    }
    return estimate;
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
