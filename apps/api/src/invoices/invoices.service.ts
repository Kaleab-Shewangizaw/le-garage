import { Injectable } from "@nestjs/common";
import { EstimateItemType, InvoiceStatus } from "@le-garage/database";
import type { GenerateInvoiceInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { assertNotGarageHandled } from "../common/work-order-lock";
import { AuditService } from "../audit/audit.service";
import { computeItemLineTotal } from "../estimates/money";

/**
 * Invoices are generated from what actually happened on the job — the
 * recorded JobPart/JobLabor entries — not from the original Estimate
 * (which was the quote, docs/DOMAIN.md §6). MVP trusts the garage to only
 * record parts/labor within the approved scope; the API does not
 * cross-validate JobPart/JobLabor descriptions against EstimateItems
 * (see docs/OPEN_QUESTIONS.md) — that would require product-matching
 * heuristics that aren't justified yet.
 *
 * Versioned like Estimate (docs/DATABASE.md §8): a DRAFT invoice is
 * mutable in place (regenerated as parts/labor change); once ISSUED it is
 * frozen. A correction VOIDs the ISSUED invoice, then a new DRAFT can be
 * generated as version + 1.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    return this.prisma.client.invoice.findMany({
      where: { jobId, organizationId },
      include: { items: true, payments: true },
      orderBy: { version: "desc" },
    });
  }

  async latest(organizationId: string, jobId: string) {
    await this.assertJobExists(organizationId, jobId);
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { jobId, organizationId },
      include: { items: true, payments: true },
      orderBy: { version: "desc" },
    });
    if (!invoice) {
      throw AppError.notFound("INVOICE_NOT_FOUND", "No invoice exists for this job yet");
    }
    return this.withBalance(invoice);
  }

  /**
   * Creates or regenerates the job's DRAFT invoice from its current
   * JobPart/JobLabor entries. Refuses to run while an ISSUED invoice is
   * still active — void it first (that's the explicit "financial history
   * changed" moment, docs/DATABASE.md §8).
   */
  async generateDraft(organizationId: string, jobId: string, actorStaffId: string, actorUserId: string, input: GenerateInvoiceInput) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    await this.assertJobExists(organizationId, jobId);

    const activeIssued = await this.prisma.client.invoice.findFirst({
      where: { jobId, organizationId, status: InvoiceStatus.ISSUED },
    });
    if (activeIssued) {
      throw AppError.conflict(
        "INVOICE_ALREADY_ISSUED",
        "This job already has an issued invoice — void it before generating a new one",
        { invoiceId: activeIssued.id },
      );
    }

    const [parts, labor] = await Promise.all([
      this.prisma.client.jobPart.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
      this.prisma.client.jobLabor.findMany({ where: { jobId, organizationId }, orderBy: { createdAt: "asc" } }),
    ]);

    if (parts.length === 0 && labor.length === 0) {
      throw AppError.conflict(
        "NOTHING_TO_INVOICE",
        "Add at least one part or labor entry before generating an invoice",
      );
    }

    const lineItems = [
      ...parts.map((p) => ({
        type: EstimateItemType.PART,
        description: p.partNumber ? `${p.name} (${p.partNumber})` : p.name,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        discount: 0,
      })),
      ...labor.map((l) => ({
        type: EstimateItemType.LABOR,
        description: l.description,
        quantity: 1,
        unitPrice: l.amount,
        discount: 0,
      })),
    ];

    const subtotal = lineItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const total = subtotal - input.discountTotal + input.taxTotal;

    const existingDraft = await this.prisma.client.invoice.findFirst({
      where: { jobId, organizationId, status: InvoiceStatus.DRAFT },
    });

    const invoice = await this.prisma.client.$transaction(async (tx) => {
      if (existingDraft) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: existingDraft.id } });
        return tx.invoice.update({
          where: { id: existingDraft.id, organizationId },
          data: {
            subtotal,
            discountTotal: input.discountTotal,
            taxTotal: input.taxTotal,
            total,
            items: { create: lineItems.map((i) => ({ ...i, lineTotal: computeItemLineTotal(i) })) },
          },
          include: { items: true },
        });
      }

      const latest = await tx.invoice.findFirst({ where: { jobId, organizationId }, orderBy: { version: "desc" } });
      const nextVersion = (latest?.version ?? 0) + 1;

      return tx.invoice.create({
        data: {
          organizationId,
          jobId,
          version: nextVersion,
          status: InvoiceStatus.DRAFT,
          createdByStaffId: actorStaffId,
          subtotal,
          discountTotal: input.discountTotal,
          taxTotal: input.taxTotal,
          total,
          supersedesInvoiceId: latest?.id,
          items: { create: lineItems.map((i) => ({ ...i, lineTotal: computeItemLineTotal(i) })) },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      organizationId,
      entityType: "Invoice",
      entityId: invoice.id,
      action: existingDraft ? "INVOICE_DRAFT_REGENERATED" : "INVOICE_DRAFT_CREATED",
      actorUserId,
      afterState: invoice,
      jobId,
    });

    return invoice;
  }

  async issue(organizationId: string, jobId: string, invoiceId: string, actorUserId: string) {
    await assertNotGarageHandled(this.prisma, organizationId, jobId);
    const invoice = await this.prisma.client.invoice.findFirst({ where: { id: invoiceId, jobId, organizationId } });
    if (!invoice) {
      throw AppError.notFound("INVOICE_NOT_FOUND", "Invoice not found");
    }
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw AppError.conflict("INVOICE_NOT_DRAFT", "Only a DRAFT invoice can be issued");
    }

    const updated = await this.prisma.client.invoice.update({
      where: { id: invoiceId, organizationId },
      data: { status: InvoiceStatus.ISSUED, issuedAt: new Date() },
      include: { items: true },
    });

    await this.audit.record({
      organizationId,
      entityType: "Invoice",
      entityId: invoiceId,
      action: "INVOICE_ISSUED",
      actorUserId,
      afterState: updated,
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  /**
   * Never a silent edit of an ISSUED invoice's history — void it,
   * generate a new DRAFT (which becomes version + 1), and issue that.
   */
  async void(organizationId: string, jobId: string, invoiceId: string, actorUserId: string, reason: string) {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, jobId, organizationId },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!invoice) {
      throw AppError.notFound("INVOICE_NOT_FOUND", "Invoice not found");
    }
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw AppError.conflict("INVOICE_NOT_ISSUED", "Only an ISSUED invoice can be voided");
    }
    if (invoice.payments.length > 0) {
      throw AppError.conflict(
        "INVOICE_HAS_PAYMENTS",
        "This invoice has payments recorded against it — void those payments first",
      );
    }

    const updated = await this.prisma.client.invoice.update({
      where: { id: invoiceId, organizationId },
      data: { status: InvoiceStatus.VOID, voidedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      entityType: "Invoice",
      entityId: invoiceId,
      action: "INVOICE_VOIDED",
      actorUserId,
      beforeState: { status: invoice.status },
      afterState: { status: updated.status, reason },
      jobId,
      affectsBoard: true,
    });

    return updated;
  }

  private withBalance<T extends { total: number; payments: { amount: number; voidedAt: Date | null }[] }>(invoice: T) {
    const paid = invoice.payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + p.amount, 0);
    return { ...invoice, amountPaid: paid, balance: invoice.total - paid };
  }

  private async assertJobExists(organizationId: string, jobId: string) {
    const job = await this.prisma.client.job.findFirst({ where: { id: jobId, organizationId, deletedAt: null } });
    if (!job) {
      throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
    }
    return job;
  }
}
