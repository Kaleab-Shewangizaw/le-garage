import { Injectable } from "@nestjs/common";
import { InvoiceStatus } from "@le-garage/database";
import type { RecordPaymentInput } from "@le-garage/validation";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";

/**
 * Payments are recorded, not processed (docs/PRODUCT.md §"What we are not
 * building", docs/ETHIOPIA.md §2) — cash/Telebirr/bank transfer happen
 * outside the platform; this just keeps an accurate, auditable ledger
 * against an ISSUED invoice. Balance is always computed from
 * total - sum(non-voided payments), never stored as a separately mutable
 * field (docs/DATABASE.md §2/§8).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, invoiceId: string) {
    await this.getInvoice(organizationId, invoiceId);
    return this.prisma.client.payment.findMany({
      where: { invoiceId, organizationId },
      orderBy: { paidAt: "desc" },
    });
  }

  async record(organizationId: string, invoiceId: string, actorStaffId: string, actorUserId: string, input: RecordPaymentInput) {
    const invoice = await this.getInvoice(organizationId, invoiceId);
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw AppError.conflict("INVOICE_NOT_ISSUED", "Payments can only be recorded against an issued invoice");
    }

    const paidSoFar = await this.balanceOf(organizationId, invoiceId, invoice.total);
    if (input.amount > paidSoFar.balance) {
      throw AppError.badRequest(
        "PAYMENT_EXCEEDS_BALANCE",
        `Amount (${input.amount}) exceeds the outstanding balance (${paidSoFar.balance})`,
        { balance: paidSoFar.balance },
      );
    }

    const payment = await this.prisma.client.payment.create({
      data: {
        organizationId,
        invoiceId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        recordedByStaffId: actorStaffId,
      },
    });

    await this.audit.record({
      organizationId,
      entityType: "Payment",
      entityId: payment.id,
      action: "PAYMENT_RECORDED",
      actorUserId,
      afterState: payment,
    });

    return payment;
  }

  async void(organizationId: string, invoiceId: string, paymentId: string, actorUserId: string, reason: string) {
    const payment = await this.prisma.client.payment.findFirst({ where: { id: paymentId, invoiceId, organizationId } });
    if (!payment) {
      throw AppError.notFound("PAYMENT_NOT_FOUND", "Payment not found");
    }
    if (payment.voidedAt) {
      throw AppError.conflict("PAYMENT_ALREADY_VOID", "This payment is already voided");
    }

    const updated = await this.prisma.client.payment.update({
      where: { id: paymentId, organizationId },
      data: { voidedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      entityType: "Payment",
      entityId: paymentId,
      action: "PAYMENT_VOIDED",
      actorUserId,
      beforeState: { voidedAt: null },
      afterState: { voidedAt: updated.voidedAt, reason },
    });

    return updated;
  }

  async balance(organizationId: string, invoiceId: string) {
    const invoice = await this.getInvoice(organizationId, invoiceId);
    return this.balanceOf(organizationId, invoiceId, invoice.total);
  }

  private async balanceOf(organizationId: string, invoiceId: string, total: number) {
    const payments = await this.prisma.client.payment.findMany({
      where: { invoiceId, organizationId, voidedAt: null },
    });
    const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    return { total, amountPaid, balance: total - amountPaid };
  }

  private async getInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.client.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) {
      throw AppError.notFound("INVOICE_NOT_FOUND", "Invoice not found");
    }
    return invoice;
  }
}
