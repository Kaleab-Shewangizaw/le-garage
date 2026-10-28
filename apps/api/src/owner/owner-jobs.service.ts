import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { OwnerAccessService } from "./owner-access.service";

@Injectable()
export class OwnerJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OwnerAccessService,
  ) {}

  /**
   * Deliberately does NOT include raw JobPart/JobLabor rows: JobPart
   * carries `unitCost` (what the garage paid — its margin) and `supplier`,
   * neither of which should ever reach a customer (docs/AUTH.md §3,
   * OPEN_QUESTIONS.md #7 — pricing visibility). "What work was done and
   * what it costs" comes from EstimateItem/InvoiceItem instead, which only
   * ever carry customer-facing `unitPrice`/`lineTotal`.
   */
  async getById(ownerId: string, jobId: string) {
    await this.access.assertJobAccess(ownerId, jobId);

    return this.prisma.unscopedClient.job.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        vehicle: true,
        organization: { include: { garage: true } },
        assignedTechnician: { include: { user: { select: { fullName: true } } } },
        diagnoses: { orderBy: { createdAt: "asc" } },
        estimates: { orderBy: { version: "desc" }, include: { items: true } },
        approvals: { include: { itemDecisions: true } },
        invoices: { orderBy: { version: "desc" }, include: { items: true, payments: { where: { voidedAt: null } } } },
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });
  }
}
