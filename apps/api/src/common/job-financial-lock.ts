import { InvoiceStatus } from "@le-garage/database";
import { PrismaService } from "./prisma/prisma.service";
import { AppError } from "./errors/app-error";

/**
 * Parts and labor feed directly into invoice generation
 * (docs/DOMAIN.md §3, docs/DATABASE.md §8). Once an invoice has been
 * ISSUED for a job, further changes to its parts/labor would silently make
 * that invoice inaccurate — so they're locked. A correction requires
 * voiding the invoice first (making the "financial history changed"
 * moment explicit and audited) rather than quietly drifting.
 */
export async function assertJobNotInvoiced(prisma: PrismaService, organizationId: string, jobId: string): Promise<void> {
  const issuedInvoice = await prisma.client.invoice.findFirst({
    where: { jobId, organizationId, status: InvoiceStatus.ISSUED },
  });
  if (issuedInvoice) {
    throw AppError.conflict(
      "JOB_ALREADY_INVOICED",
      "This job already has an issued invoice — void it before changing parts or labor",
      { invoiceId: issuedInvoice.id },
    );
  }
}
